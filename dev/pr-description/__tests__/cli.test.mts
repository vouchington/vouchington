import { execFile, spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FIXTURE_HEAD_BRANCH,
  writeFakeGh,
  writeFakeGit,
} from '../../test-helpers/pr-description/fake-cli.mts'
import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'

describe('dev/pr-description.mts CLI argument validation', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints inert help for the top level and each subcommand', async () => {
    for (const args of [['--help'], ['validate', '-h'], ['create', '--help'], ['update', '-h']]) {
      const result = await execFileAsync(process.execPath, [scriptPath, ...args])
      expect(result.stdout).toContain('Usage:')
    }
  })

  it('rejects unknown flags, missing values, surplus positionals, and mixed help', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls')
    await mkdir(binDir)
    const ghPath = join(binDir, 'gh')
    await writeFile(ghPath, '#!/bin/sh\necho called >> "$GH_CALLS_PATH"\n')
    await chmod(ghPath, 0o755)
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }
    const invalidArgs = [
      ['validate', '--wat'],
      ['validate', '--body-file', '--wat'],
      ['validate', '-F'],
      ['validate', '1', '2'],
      ['create', '--title'],
      ['create', '--title', 'title', 'extra'],
      ['update', '1', '2'],
      ['update', '1', '--help'],
    ]
    for (const args of invalidArgs) {
      await expect(
        execFileAsync(process.execPath, [scriptPath, ...args], { env }),
      ).rejects.toMatchObject({ code: 1 })
    }
    await expect(readFile(callsPath, 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('routes valid create and update commands through the gh boundary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-happy-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      `## Summary\n\nSafe CLI parsing.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`,
    )
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'CLI safety' }))",
      "else if (args[0] === 'issue') console.log('[]')",
      "else if (args[0] === 'pr' && args[1] === 'create') console.log('https://github.com/owner/repo/pull/1')",
      "else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: '' }))",
    )
    await writeFakeGit(join(binDir, 'git'))
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    const created = await execFileAsync(
      process.execPath,
      [scriptPath, 'create', '--title', 'Harden CLI', '--body-file', bodyPath],
      { env },
    )
    const updated = await execFileAsync(
      process.execPath,
      [scriptPath, 'update', '1', '--body-file', bodyPath],
      { env },
    )

    expect(created.stdout).toContain('https://github.com/owner/repo/pull/1')
    expect(updated.stdout).toContain('PR description updated.')
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[])
    const createCall = calls.find(call => call[0] === 'pr' && call[1] === 'create')
    expect(createCall).toBeDefined()
    const headIndex = createCall?.indexOf('--head')
    expect(headIndex).toBeGreaterThan(-1)
    expect(createCall?.[(headIndex ?? -1) + 1]).toBe(FIXTURE_HEAD_BRANCH)
    expect(calls).toContainEqual(
      expect.arrayContaining(['pr', 'create', '--title', 'Harden CLI', '--body-file', '--draft']),
    )
    expect(calls).toContainEqual(expect.arrayContaining(['pr', 'edit', '1', '--body-file']))
  })

  it('accepts --body-file - and -F - as stdin body sources', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-stdin-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    await mkdir(binDir)
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'CLI safety' }))",
      "else if (args[0] === 'issue') console.log('[]')",
      "else if (args[0] === 'pr' && args[1] === 'create') console.log('https://github.com/owner/repo/pull/2')",
      "else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: '' }))",
    )
    await writeFakeGit(join(binDir, 'git'))
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }
    const body = `## Summary\n\nRead stdin.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`

    const validate = spawnSync(process.execPath, [scriptPath, 'validate', '--body-file', '-'], {
      encoding: 'utf8',
      env,
      input: body,
    })
    const create = spawnSync(
      process.execPath,
      [scriptPath, 'create', '--title', 'Read stdin', '-F', '-'],
      { encoding: 'utf8', env, input: body },
    )
    const update = spawnSync(process.execPath, [scriptPath, 'update', '2', '--body-file', '-'], {
      encoding: 'utf8',
      env,
      input: body,
    })

    expect({ status: validate.status, stderr: validate.stderr }).toMatchObject({ status: 0 })
    expect(validate.stdout).toContain('PR body is valid.')
    expect({ status: create.status, stderr: create.stderr }).toMatchObject({ status: 0 })
    expect(create.stdout).toContain('https://github.com/owner/repo/pull/2')
    expect({ status: update.status, stderr: update.stderr }).toMatchObject({ status: 0 })
    expect(update.stdout).toContain('PR description updated.')
  })

  it('splices a live Shepherd Journal into a body-file update that omits it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-journal-splice-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      `## Summary\n\nUpdated summary.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`,
    )
    const liveBody = [
      '## Summary',
      '',
      'Original summary.',
      '',
      '## Shepherd Journal',
      '',
      '- Rejected suggestion X because Y.',
      '',
      '## Related issues',
      '',
      'Closes #7391',
      '',
      `Workspace setup: not needed\n${VALID_PROVENANCE_BLOCK}`,
      '',
    ].join('\n')
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'CLI safety' }))",
      "else if (args[0] === 'issue') console.log('[]')",
      `else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: ${JSON.stringify(liveBody)} }))`,
      "else if (args[0] === 'pr' && args[1] === 'edit') { const idx = args.indexOf('--body-file'); appendFileSync(process.env.GH_CALLS_PATH, `EDITED_BODY:${readFileSync(args[idx + 1], 'utf8')}\\n`) }",
    )
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    const updated = await execFileAsync(
      process.execPath,
      [scriptPath, 'update', '9', '--body-file', bodyPath],
      { env },
    )

    expect(updated.stdout).toContain('PR description updated.')
    const calls = await readFile(callsPath, 'utf8')
    expect(calls).toContain('## Shepherd Journal')
    expect(calls).toContain('- Rejected suggestion X because Y.')
  })

  it('completes update even when the advisory diff lookup fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-advisory-fail-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      `## Summary\n\nx.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`,
    )
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'CLI safety' }))",
      "else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: '' }))",
      "else if (args[0] === 'pr' && args[1] === 'diff') process.exit(1)",
    )
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    const updated = await execFileAsync(
      process.execPath,
      [scriptPath, 'update', '9', '--body-file', bodyPath],
      { env },
    )

    expect(updated.stdout).toContain('PR description updated.')
  })

  it('fails closed when a body-file update would drop a live Shepherd Journal entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-journal-reject-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      [
        '## Summary',
        '',
        'Updated summary.',
        '',
        '## Shepherd Journal',
        '',
        '- Only kept this one entry.',
        '',
        '## Related issues',
        '',
        'Closes #7391',
        '',
        `Workspace setup: not needed\n${VALID_PROVENANCE_BLOCK}`,
        '',
      ].join('\n'),
    )
    const liveBody = [
      '## Summary',
      '',
      'Original summary.',
      '',
      '## Shepherd Journal',
      '',
      '- Rejected suggestion X because Y.',
      '- Only kept this one entry.',
      '',
      '## Related issues',
      '',
      'Closes #7391',
      '',
      `Workspace setup: not needed\n${VALID_PROVENANCE_BLOCK}`,
      '',
    ].join('\n')
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'issue') console.log('[]')",
      `else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: ${JSON.stringify(liveBody)} }))`,
    )
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    await expect(
      execFileAsync(process.execPath, [scriptPath, 'update', '9', '--body-file', bodyPath], {
        env,
      }),
    ).rejects.toMatchObject({ code: 1 })

    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[])
    expect(calls.some(call => call[0] === 'pr' && call[1] === 'edit')).toBe(false)
  })
})
