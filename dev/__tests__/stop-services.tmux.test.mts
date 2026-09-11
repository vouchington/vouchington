import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const stopServicesPath = fileURLToPath(new URL('../stop-services', import.meta.url))
const resetPath = fileURLToPath(new URL('../reset', import.meta.url))
const refuseOnMainPath = fileURLToPath(new URL('../lib/refuse-on-main.sh', import.meta.url))
const dbNameFromUrlPath = fileURLToPath(new URL('../lib/db-name-from-url.sh', import.meta.url))
const testDirs: string[] = []

async function makeRepo({ isMainWorktree = false, withEnv = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-'))
  testDirs.push(dir)

  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await mkdir(join(dir, 'backend'), { recursive: true })
  await writeFile(join(dir, 'dev', 'stop-services'), await readFile(stopServicesPath, 'utf8'))
  await chmod(join(dir, 'dev', 'stop-services'), 0o755)
  await writeFile(join(dir, 'dev', 'reset'), await readFile(resetPath, 'utf8'))
  await chmod(join(dir, 'dev', 'reset'), 0o755)
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

async function makeFakeBin() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-bin-'))
  testDirs.push(dir)

  await writeFile(
    join(dir, 'tmux'),
    `#!/usr/bin/env bash
  log="\${FAKE_COMMAND_LOG:?}"
  printf 'tmux %s\\n' "$*" >> "$log"
  case "$1" in
    display-message) printf '%s\\n' "\${FAKE_TMUX_CURRENT:-}" ;;
    has-session) exit "\${FAKE_TMUX_HAS_SESSION_EXIT:-1}" ;;
    list-windows) printf '%s\\n' \${FAKE_TMUX_WINDOWS:-} ;;
    send-keys)
      if [ -n "\${FAKE_TMUX_SEND_KEYS_FAIL_TARGET:-}" ] && printf '%s' "$*" | grep -q "\${FAKE_TMUX_SEND_KEYS_FAIL_TARGET}"; then
        exit 1
      fi
      ;;
  esac
  `,
  )
  await chmod(join(dir, 'tmux'), 0o755)

  await writeFile(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
  log="\${FAKE_COMMAND_LOG:?}"
  printf 'docker %s\\n' "$*" >> "$log"
  if [ "$1" = "ps" ]; then
    printf '%s\\n' "\${FAKE_DOCKER_PS:-}"
  fi
  `,
  )
  await chmod(join(dir, 'docker'), 0o755)

  await writeFile(
    join(dir, 'lsof'),
    `#!/usr/bin/env bash
  case "$*" in
    "-a -p "*" -d cwd -Fn")
      pid="$3"
      cwd_var="FAKE_LSOF_CWD_\${pid}"
      cwd="\${!cwd_var:-\${FAKE_LSOF_CWD:-}}"
      if [ -n "$cwd" ]; then
        printf 'p%s\\nn%s\\n' "$pid" "$cwd"
      fi
      ;;
    *":3900"*) printf '%s\\n' "\${FAKE_LSOF_3900:-}" ;;
  esac
  `,
  )
  await chmod(join(dir, 'lsof'), 0o755)

  await writeFile(
    join(dir, 'ps'),
    `#!/usr/bin/env bash
  if [ "$*" = "-eo pid=,command=" ]; then
    printf '%b' "\${FAKE_PS_OUTPUT:-}"
  fi
  `,
  )
  await chmod(join(dir, 'ps'), 0o755)

  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
  if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then
    printf '%s' "$2"
    exit 0
  fi
  printf 'unexpected git invocation: %s\\n' "$*" >&2
  exit 1
  `,
  )
  await chmod(join(dir, 'git'), 0o755)

  await writeFile(
    join(dir, 'dropdb'),
    `#!/usr/bin/env bash
  printf 'dropdb %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
  `,
  )
  await chmod(join(dir, 'dropdb'), 0o755)

  await writeFile(
    join(dir, 'createdb'),
    `#!/usr/bin/env bash
  printf 'createdb %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
  `,
  )
  await chmod(join(dir, 'createdb'), 0o755)

  await writeFile(
    join(dir, 'pnpm'),
    `#!/usr/bin/env bash
  printf 'pnpm %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
  `,
  )
  await chmod(join(dir, 'pnpm'), 0o755)

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

  it('stops only service tmux windows for the current worktree session', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_WINDOWS: 'nextjs backend workers-io worker-cpu cloudflare lambdas claude codex',
      },
    })

    expect(result.stdout).toContain('Stopping tmux service windows')
    expect(result.log).toContain('tmux send-keys -t voucha-')
    expect(result.log).toContain(':nextjs C-c')
    expect(result.log).toContain(':backend C-c')
    expect(result.log).toContain(':workers-io C-c')
    expect(result.log).toContain(':worker-cpu C-c')
    expect(result.log).toContain(':cloudflare C-c')
    expect(result.log).toContain(':lambdas C-c')
    expect(result.log).not.toContain(':claude C-c')
    expect(result.log).not.toContain(':codex C-c')
  })

  it('uses the same main tmux session name as dev/tmux', async () => {
    const cwd = await makeRepo({ isMainWorktree: true })
    const binDir = await makeFakeBin()
    const session = `voucha-${cwd.split('/').at(-1)}`

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_WINDOWS: 'nextjs',
      },
    })

    expect(result.log).toContain(`tmux has-session -t ${session}`)
    expect(result.log).toContain(`tmux send-keys -t ${session}:nextjs C-c`)
  })

  it('skips the current tmux service window', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const session = `voucha-${cwd.split('/').at(-1)}`

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_TMUX_CURRENT: `${session}:backend`,
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_WINDOWS: 'nextjs backend workers-io',
        TMUX: '/tmp/tmux-session',
      },
    })

    expect(result.stdout).toContain('Skipping current tmux window backend')
    expect(result.log).toContain(`tmux send-keys -t ${session}:nextjs C-c`)
    expect(result.log).not.toContain(`tmux send-keys -t ${session}:backend C-c`)
    expect(result.log).toContain(`tmux send-keys -t ${session}:workers-io C-c`)
  })

  it('continues when a tmux service window disappears before send-keys', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const session = `voucha-${cwd.split('/').at(-1)}`

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: '',
        FAKE_TMUX_HAS_SESSION_EXIT: '0',
        FAKE_TMUX_SEND_KEYS_FAIL_TARGET: `${session}:backend`,
        FAKE_TMUX_WINDOWS: 'nextjs backend workers-io',
      },
    })

    expect(result.stdout).toContain('Could not send Ctrl-C to backend; continuing')
    expect(result.log).toContain(`tmux send-keys -t ${session}:nextjs C-c`)
    expect(result.log).toContain(`tmux send-keys -t ${session}:backend C-c`)
    expect(result.log).toContain(`tmux send-keys -t ${session}:workers-io C-c`)
  })
})
