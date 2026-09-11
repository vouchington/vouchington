import { execFile, spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))

const BODY_WITHOUT_PROVENANCE = [
  '## Summary',
  '',
  'Brief summary.',
  '',
  '## Related issues',
  '',
  'Closes #7391',
  '',
  'Workspace setup: ./dev/initialize monorepo',
  '',
].join('\n')

async function writeFakeGh(ghPath: string, ...branches: string[]): Promise<void> {
  await writeFile(
    ghPath,
    ['#!/usr/bin/env node', 'const args = process.argv.slice(2)', ...branches].join('\n'),
  )
  await chmod(ghPath, 0o755)
}

describe('dev/pr-description.mts validate — provenance scope split by body source', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('auto-injects provenance for a local draft, so a body-file source never fails on it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-validate-inject-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(bodyPath, BODY_WITHOUT_PROVENANCE)
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'Draft validation' }))",
    )
    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` }

    const result = await execFileAsync(
      process.execPath,
      [scriptPath, 'validate', '--body-file', bodyPath],
      { env },
    )

    expect(result.stdout).toContain('PR body is valid.')
  })

  it('still fails a live PR body missing provenance, so `validate <pr>` remains the enforcement backstop', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-validate-gate-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    await mkdir(binDir)
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      `if (args[0] === 'pr' && args[1] === 'view' && args.includes('body')) console.log(JSON.stringify({ body: ${JSON.stringify(BODY_WITHOUT_PROVENANCE)} }))`,
      "else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ baseRefOid: 'base-sha', headRefOid: 'head-sha', number: 9, state: 'OPEN', url: 'https://github.com/owner/repo/pull/9' }))",
      "else if (args[0] === 'pr' && args[1] === 'diff') console.log('')",
    )
    const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` }

    const result = spawnSync(process.execPath, [scriptPath, 'validate', '9'], {
      encoding: 'utf8',
      env,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('"Agent:" line')
    expect(result.stderr).toContain('"Device:" line')
    expect(result.stderr).toContain('"Worktree:" line')
  })
})
