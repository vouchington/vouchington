import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { makeStopServicesTmuxFakeBin } from '../test-helpers/stop-services-tmux.mts'

const execFileAsync = promisify(execFile)
const stopServicesPath = fileURLToPath(new URL('../stop-services', import.meta.url))
const resetPath = fileURLToPath(new URL('../reset', import.meta.url))
const refuseOnMainPath = fileURLToPath(new URL('../lib/refuse-on-main.sh', import.meta.url))
const gitWorktreesPath = fileURLToPath(
  new URL(
    '../../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
    import.meta.url,
  ),
)
const dbNameFromUrlPath = fileURLToPath(new URL('../lib/db-name-from-url.sh', import.meta.url))
const testDirs: string[] = []

async function makeRepo({ isMainWorktree = false, withEnv = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-'))
  testDirs.push(dir)

  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await writeFile(
    join(dir, 'dev', 'lib', 'git-worktrees.sh'),
    await readFile(gitWorktreesPath, 'utf8'),
  )
  await mkdir(join(dir, 'backend'), { recursive: true })
  await writeFile(join(dir, 'dev', 'stop-services'), await readFile(stopServicesPath, 'utf8'))
  await chmod(join(dir, 'dev', 'stop-services'), 0o755)
  await writeFile(join(dir, 'dev', 'reset'), await readFile(resetPath, 'utf8'))
  await chmod(join(dir, 'dev', 'reset'), 0o755)
  await writeFile(
    join(dir, 'dev', 'db-clean'),
    '#!/usr/bin/env bash\nprintf "db-clean\\n" >> "${FAKE_COMMAND_LOG:?}"\n',
  )
  await chmod(join(dir, 'dev', 'db-clean'), 0o755)
  await writeFile(
    join(dir, 'dev', 'lib', 'refuse-on-main.sh'),
    await readFile(refuseOnMainPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'db-name-from-url.sh'),
    await readFile(dbNameFromUrlPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'worktree-resource-env.sh'),
    `worktree_resource_clear_env() { unset PORT NEXT_PORT WEB_PORT WORKER_PORT IMAGE_LAMBDA_PORT INSPECTOR_PORT STORYBOOK_PORT VALKEY_URL VALKEY_SESSION_URL VALKEY_CACHE_URL VALKEY_RATE_LIMITER_URL VALKEY_DYNAMIC_CONFIG_URL VALKEY_WORKER_QUEUE_URL VALKEY_CONTAINER DATABASE_URL WORKTREE_DIR; }
worktree_resource_load_current_env() { worktree_resource_clear_env; [ -f "$1/.env" ] || return 1; set -a; source "$1/.env"; set +a; }; refuse_shared_resources_on_disposable() { :; }
`,
  )
  if (isMainWorktree) {
    await mkdir(join(dir, '.git'), { recursive: true })
  } else {
    await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
  }

  if (withEnv) {
    await writeFile(
      join(dir, '.env'),
      `export PORT=3900
  export NEXT_PORT=3901
  export WORKER_PORT=3902
  export IMAGE_LAMBDA_PORT=3903
  export INSPECTOR_PORT=3904
  export VALKEY_CONTAINER=voucha-valkey-test
  export DATABASE_URL=postgres://localhost/voucha-test
  export WORKTREE_DIR=${basename(dir)}
  `,
    )
  }

  return dir
}

async function readLog(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

async function runScript({
  args = [],
  binDir,
  cwd,
  env = {},
  script = 'stop-services',
}: {
  args?: string[]
  binDir: string
  cwd: string
  env?: Record<string, string>
  script?: 'reset' | 'stop-services'
}) {
  const logPath = join(cwd, 'commands.log')
  const result = await execFileAsync('bash', [join(cwd, 'dev', script), ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
      FAKE_COMMAND_LOG: logPath,
      PATH: `${binDir}:/usr/bin:/bin`,
    },
  })

  return {
    log: await readLog(logPath),
    stderr: result.stderr,
    stdout: result.stdout,
  }
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
