import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('../../retrospective-save.mts', import.meta.url))
const testDirs: string[] = []

const VALID_RETRO_DOC = `---
date: 2026-07-20
description: sample retro for retrospective-save CLI tests
issues: []
prs: []
session_id: sess-1
worktree: bubbly-knitting-manatee
---

## Verifiable Facts

=== Retrospective Facts ===

## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: none observed
`

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'retrospective-save-cli-'))
  testDirs.push(dir)
  return dir
}

describe('retrospective-save CLI', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints inert top-level, save, and check help', async () => {
    for (const args of [['--help'], ['save', '-h'], ['check', '-h']]) {
      const result = await execFileAsync(process.execPath, [scriptPath, ...args])
      expect(result.stdout).toContain('Usage:')
    }
  })

  it('advertises check in the top-level usage', async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, '--help'])
    expect(result.stdout).toContain('check [--session-id')
  })

  it('rejects an unknown subcommand with usage on stderr and exit code 1', async () => {
    const rejection = await execFileAsync(process.execPath, [scriptPath, 'bogus']).then(
      () => {
        throw new Error('expected the process to exit nonzero')
      },
      (error: unknown) => error,
    )
    expect(rejection).toMatchObject({ code: 1 })
    expect(String((rejection as { stderr: string }).stderr)).toContain('Usage:')
  })

  it('prints Error and Replay-with lines on stderr and exits 1 on a hard failure', async () => {
    const dir = await makeTempDir()
    const stagedFile = join(dir, 'staged.md')
    await writeFile(stagedFile, VALID_RETRO_DOC)

    const rejection = await execFileAsync(
      process.execPath,
      [scriptPath, 'save', '--file', stagedFile, '--session-id', 'sess-1'],
      {
        env: {
          ...process.env,
          AGENT_BLACKBOARD_URL: 'http://127.0.0.1:1/',
          AGENT_BLACKBOARD_TOKEN: 'test-token',
        },
      },
    ).then(
      () => {
        throw new Error('expected the process to exit nonzero')
      },
      (error: unknown) => error,
    )

    expect(rejection).toMatchObject({ code: 1 })
    const stderr = String((rejection as { stderr: string }).stderr)
    expect(stderr).toContain('Error:')
    expect(stderr).toContain(
      `Replay with: node dev/retrospective-save.mts save --file '${stagedFile}' ` +
        `--session-id 'sess-1'`,
    )
  })

  it('preserves an unfinished root-session rotation in a replay command', async () => {
    const dir = await makeTempDir()
    const stagedFile = join(dir, 'staged.md')
    await writeFile(stagedFile, VALID_RETRO_DOC)
    await writeFile(join(dir, '.local'), 'not a directory')

    const rejection = await execFileAsync(
      process.execPath,
      [scriptPath, 'save', '--file', stagedFile, '--root-codex', '--new-root-codex-session'],
      { cwd: dir },
    ).catch((error: unknown) => error)

    expect(String((rejection as { stderr: string }).stderr)).toContain(
      '--root-codex --new-root-codex-session',
    )
  })

  it('rejects invalid root identity combinations without a replay hint', async () => {
    const dir = await makeTempDir()
    const stagedFile = join(dir, 'staged.md')
    await writeFile(stagedFile, VALID_RETRO_DOC)
    const rejection = await execFileAsync(process.execPath, [
      scriptPath,
      'save',
      '--file',
      stagedFile,
      '--root-codex',
      '--session-id',
      'sess-1',
    ]).catch((error: unknown) => error)
    const stderr = String((rejection as { stderr: string }).stderr)
    expect(stderr).toContain('--root-codex cannot be used with --session-id')
    expect(stderr).not.toContain('Replay with:')
  })
})
