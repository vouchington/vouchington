import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { makeStopServicesRepo, readLog, runScript } from '../test-helpers/stop-services-repo.mts'
import { makeStopServicesTmuxFakeBin } from '../test-helpers/stop-services-tmux.mts'

const execFileAsync = promisify(execFile)
const testDirs: string[] = []

function makeRepo(options: { isMainWorktree?: boolean; withEnv?: boolean } = {}) {
  return makeStopServicesRepo(testDirs, { ...options, profile: 'tmux' })
}

describe('dev/stop-services (tmux)', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('closes the exact managed session, including manually added windows', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
      },
    })

    expect(result.stdout).toContain('Stopping tmux session')
    expect(result.log).toContain('tmux kill-session -t =voucha-d')
    expect(result.log).not.toContain('tmux send-keys')
  })

  it('uses the same main tmux session name as dev/tmux', async () => {
    const cwd = await makeRepo({ isMainWorktree: true })
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)
    const session = `voucha-d${createHash('sha256')
      .update(await realpath(cwd))
      .digest('hex')
      .slice(0, 12)}`

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
      },
    })

    expect(result.log).toContain(`tmux has-session -t =${session}`)
    expect(result.log).toContain('tmux kill-session -t =voucha-d')
  })

  it('finishes other cleanup before closing its caller’s tmux session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: 'voucha-valkey-test',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        TMUX: '/tmp/tmux-session',
      },
    })

    expect(result.log.indexOf('docker stop voucha-valkey-test')).toBeLessThan(
      result.log.indexOf('tmux kill-session -t =voucha-d'),
    )
  })

  it('defers closure until a nested reset command has finished', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)
    const session = `voucha-d${createHash('sha256')
      .update(await realpath(cwd))
      .digest('hex')
      .slice(0, 12)}`

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_PANE_SESSION: session,
        FAKE_TMUX_PANE_PID: String(process.pid),
        TMUX_PANE: '%1',
      },
      script: 'reset',
    })

    expect(result.stdout).toContain('Reset complete!')
    expect(result.log).toContain('tmux run-shell -b while [ "$(ps -p')
    expect(result.log).not.toMatch(/^tmux kill-session/m)
    expect(result.log.indexOf('tmux run-shell -b')).toBeLessThan(
      result.log.indexOf('pnpm run db:migrate'),
    )

    // A recycled command PID under another parent must not keep the waiter
    // alive, even if that PID is still running.
    const watcher = result.log
      .split('\n')
      .find(line => line.startsWith('tmux run-shell -b '))
      ?.slice('tmux run-shell -b '.length)
    expect(watcher).toBeDefined()
    await execFileAsync('bash', ['-c', watcher!], {
      cwd,
      env: {
        ...process.env,
        FAKE_COMMAND_LOG: join(cwd, 'commands.log'),
        FAKE_PS_PARENT: '1',
        PATH: `${binDir}:/usr/bin:/bin`,
      },
      timeout: 3000,
    })
    expect(await readLog(join(cwd, 'commands.log'))).toContain(`tmux kill-session -t =${session}`)
  })

  it('leaves the calling pane alive if it cannot identify its command', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)
    const session = `voucha-d${createHash('sha256')
      .update(await realpath(cwd))
      .digest('hex')
      .slice(0, 12)}`
    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_PS_FAIL: '1',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_PANE_SESSION: session,
        FAKE_TMUX_PANE_PID: '12345',
        TMUX_PANE: '%1',
      },
    })

    expect(result.stdout).toContain('leaving tmux session running')
    expect(result.log).not.toContain('tmux kill-session')
    expect(result.log).not.toContain('tmux run-shell')
  })

  it('checks the parent when the pane process itself is the caller', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)
    const session = `voucha-d${createHash('sha256')
      .update(await realpath(cwd))
      .digest('hex')
      .slice(0, 12)}`
    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_PS_PARENT: '765',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_PANE_SESSION: session,
        FAKE_TMUX_PANE_PID: 'self',
        TMUX_PANE: '%1',
      },
    })

    expect(result.log).toContain('tmux run-shell -b while [ "$(ps -p')
    expect(result.log).toContain('= "765" ]')
    expect(result.log).not.toMatch(/^tmux kill-session/m)
  })
})
