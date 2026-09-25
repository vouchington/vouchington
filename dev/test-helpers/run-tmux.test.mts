import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { toolingTestBudget } from '../../test-helpers/vitest-config/tooling-projects.mts'
import { RUN_TMUX_TIMEOUT_MS, runTmux } from './run-tmux.mts'

const testDirs: string[] = []

async function makeFakeTmuxCwd(script: string) {
  const dir = await mkdtemp(join(tmpdir(), 'run-tmux-test-cwd-'))
  testDirs.push(dir)
  await mkdir(join(dir, 'dev'), { recursive: true })
  await writeFile(join(dir, 'dev', 'tmux'), script)
  await chmod(join(dir, 'dev', 'tmux'), 0o755)
  return dir
}

describe('runTmux', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('reports a timeout instead of coercing it to a normal exit code', async () => {
    // `exec` replaces the bash process with sleep so SIGTERM kills the one process
    // runTmux is watching, instead of leaving an orphaned child behind.
    const cwd = await makeFakeTmuxCwd('#!/bin/bash\nexec /bin/sleep 5\n')

    const result = await runTmux({ binDir: tmpdir(), cwd, timeoutMs: 200 })

    expect(result).toMatchObject({
      code: null,
      signal: 'SIGTERM',
      timedOut: true,
      errno: undefined,
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(150)
    expect(result.durationMs).toBeLessThan(4000)
  })

  // The "killed beats a trapped exit code" rule (a real harness timeout must be
  // reported via `killed` even when the child traps the signal and exits with its
  // own numeric code, e.g. dev/tmux's `trap 'exit 143' TERM`) is a runProcess mapping
  // concern now, not a runTmux one: see run-process.test.mts.

  it('reports a spawn error instead of coercing it to exit code 1', async () => {
    const cwd = join(tmpdir(), 'run-tmux-test-cwd-that-does-not-exist')

    const result = await runTmux({ binDir: tmpdir(), cwd })

    expect(result).toMatchObject({
      code: null,
      signal: null,
      timedOut: false,
      errno: 'ENOENT',
    })
  })

  it('maps a normal exit 0 through with captured stdout and stderr', async () => {
    const cwd = await makeFakeTmuxCwd(
      '#!/bin/bash\nprintf "out-line\\n"\nprintf "err-line\\n" >&2\nexit 0\n',
    )

    const result = await runTmux({ binDir: tmpdir(), cwd })

    expect(result).toMatchObject({
      code: 0,
      signal: null,
      timedOut: false,
      errno: undefined,
      stdout: 'out-line\n',
      stderr: 'err-line\n',
    })
  })

  it('maps a normal exit 3 through with captured stdout and stderr', async () => {
    const cwd = await makeFakeTmuxCwd(
      '#!/bin/bash\nprintf "out-line\\n"\nprintf "err-line\\n" >&2\nexit 3\n',
    )

    const result = await runTmux({ binDir: tmpdir(), cwd })

    expect(result).toMatchObject({
      code: 3,
      signal: null,
      timedOut: false,
      errno: undefined,
      stdout: 'out-line\n',
      stderr: 'err-line\n',
    })
  })

  it('keeps the harness bound strictly below the configured tooling test timeout', () => {
    expect(RUN_TMUX_TIMEOUT_MS).toBeGreaterThan(0)
    expect(RUN_TMUX_TIMEOUT_MS).toBeLessThan(toolingTestBudget.testTimeout)
  })
})
