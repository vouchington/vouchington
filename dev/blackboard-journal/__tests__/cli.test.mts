import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('../../blackboard-journal.mts', import.meta.url))
const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'blackboard-journal-cli-'))
  testDirs.push(dir)
  return dir
}

describe('blackboard-journal CLI', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('prints inert top-level and append help', async () => {
    for (const args of [['--help'], ['append', '-h']]) {
      const result = await execFileAsync(process.execPath, [scriptPath, ...args])
      expect(result.stdout).toContain('Usage:')
      expect(result.stdout).toContain('--root-codex')
    }
  })

  it('preserves the explicit root-Codex signal in a replay command', async () => {
    const dir = await makeTempDir()
    const noteFile = join(dir, 'note.md')
    await writeFile(noteFile, 'a note')
    const rejection = await execFileAsync(
      process.execPath,
      [scriptPath, 'append', '--file', noteFile, '--root-codex'],
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

    expect(String((rejection as { stderr: string }).stderr)).toContain('--root-codex')
  })

  it('preserves an unfinished root-session rotation in a replay command', async () => {
    const dir = await makeTempDir()
    const noteFile = join(dir, 'note.md')
    await writeFile(noteFile, 'a note')
    await writeFile(join(dir, '.local'), 'not a directory')

    const rejection = await execFileAsync(
      process.execPath,
      [scriptPath, 'append', '--file', noteFile, '--root-codex', '--new-root-codex-session'],
      { cwd: dir },
    ).catch((error: unknown) => error)

    expect(String((rejection as { stderr: string }).stderr)).toContain(
      '--root-codex --new-root-codex-session',
    )
  })

  it('rejects invalid root identity combinations without a replay hint', async () => {
    const dir = await makeTempDir()
    const noteFile = join(dir, 'note.md')
    await writeFile(noteFile, 'a note')
    const rejection = await execFileAsync(process.execPath, [
      scriptPath,
      'append',
      '--file',
      noteFile,
      '--root-codex',
      '--session-id',
      'sess-1',
    ]).catch((error: unknown) => error)
    const stderr = String((rejection as { stderr: string }).stderr)
    expect(stderr).toContain('--root-codex cannot be used with --session-id')
    expect(stderr).not.toContain('Replay with:')
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
    const noteFile = join(dir, 'note.md')
    await writeFile(noteFile, 'a note')

    const rejection = await execFileAsync(
      process.execPath,
      [scriptPath, 'append', '--file', noteFile, '--session-id', 'sess-1'],
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
      `Replay with: node dev/blackboard-journal.mts append --file '${noteFile}' ` +
        `--session-id 'sess-1'`,
    )
  })
})
