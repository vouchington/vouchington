import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTmuxTestDirs, makeFakeBin, makeRepo, runTmux } from './test-helpers/tmux.mts'

function createdWindowNames(log: string) {
  return log.split('\n').flatMap(line => {
    if (!line.startsWith('new-session ') && !line.startsWith('new-window ')) return []
    const parts = line.split(' ')
    return [parts[parts.indexOf('-n') + 1]]
  })
}

describe('dev/tmux --no-attach', () => {
  afterEach(cleanupTmuxTestDirs)

  it('starts all service windows without attaching when --no-attach is passed inside tmux', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({
      binDir,
      cwd,
      tmuxEnv: '/tmp/tmux-session',
      args: ['--no-attach'],
    })

    expect(result.exitCode).toBe(0)
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'workers-io',
      'worker-cpu',
      'cloudflare',
      'lambdas',
      'claude',
      'codex',
      'shell',
    ])
    expect(result.log).not.toContain('attach')
    expect(result.stdout).toContain('Services started in tmux session')
  })

  it('exits 0 without creating windows when session exists and --no-attach is passed', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_HAS_SESSION_EXIT: '0' },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Services already running in tmux session')
    expect(createdWindowNames(result.log)).toEqual([])
    expect(result.nodeLog).not.toContain('worker-queue-policy-cli.mts')
  })
})
