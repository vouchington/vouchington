import { realpathSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeRepo, registerTmuxFakeHooks, runTmux } from './test-helpers/tmux.mts'

function createdWindowNames(log: string) {
  return log.split('\n').flatMap(line => {
    if (!line.startsWith('new-session ') && !line.startsWith('new-window ')) return []
    const parts = line.split(' ')
    return [parts[parts.indexOf('-n') + 1]]
  })
}

describe('dev/tmux --no-attach', () => {
  const { makeFakeBin } = registerTmuxFakeHooks()

  it('starts all service windows without attaching when --no-attach is passed inside tmux', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({
      binDir,
      cwd,
      tmuxEnv: '/tmp/tmux-session',
      args: ['--no-attach'],
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(createdWindowNames(result.log)).toEqual([
      'nextjs',
      'backend',
      'worker',
      'cloudflare',
      'lambdas',
    ])
    expect(result.log).not.toContain('attach')
    expect(result.stdout).toContain('Services started in tmux session')
  })

  it('gives the API and worker one worktree-local catalog', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_EXECUTE_COMMANDS: '1' },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    const paths = result.nodeArgLog
      .split('\n')
      .filter(line => line.startsWith('node-env\tLOCALIZATION_SQLITE_PATH='))
      .map(line => line.slice('node-env\tLOCALIZATION_SQLITE_PATH='.length))
      .filter(Boolean)
    expect(paths).toHaveLength(2)
    expect(new Set(paths)).toEqual(
      new Set([`${realpathSync(cwd)}/.local/localization/catalog.sqlite`]),
    )
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

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.stdout).toContain('Services already running in tmux session')
    expect(createdWindowNames(result.log)).toEqual([])
    expect(result.nodeLog).not.toContain('worker-queue-policy-cli.mts')
    expect(result.log).not.toContain('respawn-pane')
    expect(result.log).toMatch(/^pgrep -P \d+ \.$/m)
  })

  it('respawns only a dead backend child on an idle ready session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_DEAD_WINDOWS: 'backend', FAKE_TMUX_HAS_SESSION_EXIT: '0' },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    const respawns = result.log.split('\n').filter(line => line.startsWith('respawn-pane'))
    expect(respawns).toHaveLength(1)
    expect(respawns[0]).toContain('respawn-pane -k')
    expect(respawns[0]).toMatch(/:backend/)
    expect(result.log).not.toMatch(/respawn-pane .*:nextjs/)
    expect(result.log).not.toMatch(/respawn-pane .*:worker/)
    expect(result.nodeLog).toContain('worker-queue-policy-cli.mts')
    expect(result.nodeLog).toContain('local-catalog.mts')
  })

  it('does not rebuild the catalog when only lambdas is dead', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_DEAD_WINDOWS: 'lambdas', FAKE_TMUX_HAS_SESSION_EXIT: '0' },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.log).toMatch(/respawn-pane -k .*:lambdas/)
    expect(result.nodeLog).not.toContain('worker-queue-policy-cli.mts')
    expect(result.nodeLog).not.toContain('local-catalog.mts')
  })

  it('creates a missing worker window on an idle ready session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: {
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_WINDOWS: 'nextjs backend cloudflare lambdas',
      },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(createdWindowNames(result.log)).toEqual(['worker'])
    expect(result.log).not.toContain('respawn-pane')
    expect(result.nodeLog).toContain('worker-queue-policy-cli.mts')
  })

  it('does not respawn after waiting for a ready 0-to-1 transition', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: {
        FAKE_TMUX_DEAD_WINDOWS: 'backend',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_READY_AFTER: '3',
      },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.stdout).toContain('Services already running')
    expect(result.log).not.toContain('respawn-pane')
    expect(createdWindowNames(result.log)).toEqual([])
  })

  it('restarts a stopped Valkey container before reusing the session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const result = await runTmux({
      binDir,
      cwd,
      args: ['--no-attach'],
      extraEnv: { FAKE_TMUX_HAS_SESSION_EXIT: '0', VALKEY_CONTAINER: 'voucha-test-valkey' },
    })

    expect(result).toEqual(expect.objectContaining({ code: 0 }))
    expect(result.log).toContain('docker start voucha-test-valkey')
    expect(createdWindowNames(result.log)).toEqual([])
  })
})
