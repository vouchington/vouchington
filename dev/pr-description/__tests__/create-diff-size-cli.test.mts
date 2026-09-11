import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { FIXTURE_HEAD_BRANCH, FIXTURE_REMOTE_SHA, writeFakeGh } from '../test-helpers/fake-cli.mts'
import { VALID_PROVENANCE_BLOCK } from '../test-helpers/valid-pr-body.mts'
import { LARGE_DIFF_LINE_THRESHOLD } from '../diff-size.mts'

/**
 * `writeFakeGit` (test-helpers/fake-cli.mts) does not stub `git diff` at all — every existing CLI
 * test therefore exercises `getDiffAgainstBase` against empty output, which is under the size
 * threshold and never trips the new gate. This local fake extends it with a `diff` branch so the
 * gate itself can be exercised end-to-end.
 */
async function writeFakeGitWithDiff(gitPath: string, diffText: string): Promise<void> {
  await writeFile(
    gitPath,
    [
      '#!/usr/bin/env node',
      'const args = process.argv.slice(2)',
      "if (args[0] === 'branch' && args.includes('--show-current'))",
      `  console.log(${JSON.stringify(FIXTURE_HEAD_BRANCH)})`,
      "else if (args[0] === 'ls-remote')",
      `  console.log(${JSON.stringify(`${FIXTURE_REMOTE_SHA}\trefs/heads/${FIXTURE_HEAD_BRANCH}`)})`,
      "else if (args[0] === 'rev-parse')",
      `  console.log(${JSON.stringify(FIXTURE_REMOTE_SHA)})`,
      "else if (args[0] === 'diff')",
      `  console.log(${JSON.stringify(diffText)})`,
    ].join('\n'),
  )
  await chmod(gitPath, 0o755)
}

function largeDiff(changedLines: number): string {
  const lines = ['--- a/big.txt', '+++ b/big.txt']
  for (let i = 0; i < changedLines; i++) lines.push(`+line ${i}`)
  return lines.join('\n')
}

function smallDiff(): string {
  return ['--- a/small.txt', '+++ b/small.txt', '+one line changed'].join('\n')
}

describe('dev/pr-description.mts create — large-diff size gate', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function setUp(diffText: string) {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-diff-size-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      `## Summary\n\nLarge diff gate.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`,
    )
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'CLI safety' }))",
      "else if (args[0] === 'issue') console.log('[]')",
      "else if (args[0] === 'pr' && args[1] === 'create') console.log('https://github.com/owner/repo/pull/3')",
      "else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: '' }))",
    )
    await writeFakeGitWithDiff(join(binDir, 'git'), diffText)
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }
    return { bodyPath, callsPath, env }
  }

  it('refuses create over the threshold without --acknowledge-large-diff', async () => {
    const changedLines = LARGE_DIFF_LINE_THRESHOLD + 1
    const { bodyPath, callsPath, env } = await setUp(largeDiff(changedLines))

    await expect(
      execFileAsync(
        process.execPath,
        [scriptPath, 'create', '--title', 'Too big', '--body-file', bodyPath],
        { env },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('--acknowledge-large-diff'),
    })

    const calls = await readFile(callsPath, 'utf8').catch(() => '')
    expect(calls).not.toContain('"pr","create"')
  })

  it('proceeds over the threshold when --acknowledge-large-diff is passed', async () => {
    const changedLines = LARGE_DIFF_LINE_THRESHOLD + 1
    const { bodyPath, callsPath, env } = await setUp(largeDiff(changedLines))

    const result = await execFileAsync(
      process.execPath,
      [
        scriptPath,
        'create',
        '--title',
        'Too big but acknowledged',
        '--body-file',
        bodyPath,
        '--acknowledge-large-diff',
      ],
      { env },
    )

    expect(result.stdout).toContain('https://github.com/owner/repo/pull/3')
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[])
    expect(calls.some(call => call[0] === 'pr' && call[1] === 'create')).toBe(true)
  })

  it('is unaffected under the threshold', async () => {
    const { bodyPath, callsPath, env } = await setUp(smallDiff())

    const result = await execFileAsync(
      process.execPath,
      [scriptPath, 'create', '--title', 'Small diff', '--body-file', bodyPath],
      { env },
    )

    expect(result.stdout).toContain('https://github.com/owner/repo/pull/3')
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[])
    expect(calls.some(call => call[0] === 'pr' && call[1] === 'create')).toBe(true)
  })
})
