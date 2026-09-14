import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptDir = fileURLToPath(new URL('..', import.meta.url))
const stopServicesPath = join(scriptDir, 'stop-services')
const resetPath = join(scriptDir, 'reset')
const refuseOnMainPath = join(scriptDir, 'lib/refuse-on-main.sh')
const dbNameFromUrlPath = join(scriptDir, 'lib/db-name-from-url.sh')
const publishedGitWorktreesPath = join(
  scriptDir,
  '../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
)

async function writeExecutable(path: string, content: string) {
  await writeFile(path, content)
  await chmod(path, 0o755)
}

export function createStopServicesFixtures() {
  const testDirs: string[] = []

  async function makeRepo({ isMainWorktree = false, withEnv = true } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-'))
    testDirs.push(dir)
    await Promise.all([
      mkdir(join(dir, 'dev', 'lib'), { recursive: true }),
      mkdir(join(dir, 'backend'), { recursive: true }),
    ])
    const [stopServices, reset, refuseOnMain, dbNameFromUrl] = await Promise.all([
      readFile(stopServicesPath, 'utf8'),
      readFile(resetPath, 'utf8'),
      readFile(refuseOnMainPath, 'utf8'),
      readFile(dbNameFromUrlPath, 'utf8'),
    ])
    await Promise.all([
      writeExecutable(join(dir, 'dev', 'stop-services'), stopServices),
      writeExecutable(join(dir, 'dev', 'reset'), reset),
      writeFile(join(dir, 'dev', 'lib', 'refuse-on-main.sh'), refuseOnMain),
      writeFile(join(dir, 'dev', 'lib', 'db-name-from-url.sh'), dbNameFromUrl),
      writeFile(
        join(dir, 'dev', 'lib', 'worktree-resource-env.sh'),
        `worktree_resource_clear_env() { unset PORT NEXT_PORT WEB_PORT WORKER_PORT IMAGE_LAMBDA_PORT INSPECTOR_PORT STORYBOOK_PORT VALKEY_URL VALKEY_SESSION_URL VALKEY_CACHE_URL VALKEY_RATE_LIMITER_URL VALKEY_DYNAMIC_CONFIG_URL VALKEY_WORKER_QUEUE_URL VALKEY_CONTAINER DATABASE_URL WORKTREE_DIR; }
worktree_resource_load_current_env() { worktree_resource_clear_env; [ -f "$1/.env" ] || return 1; set -a; source "$1/.env"; set +a; }
refuse_shared_resources_on_disposable() { :; }
`,
      ),
    ])
    await writeFile(
      join(dir, 'dev', 'lib', 'git-worktrees.sh'),
      await readFile(publishedGitWorktreesPath, 'utf8'),
    )
    if (isMainWorktree) await mkdir(join(dir, '.git'), { recursive: true })
    else await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
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
    const files = {
      tmux: `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'tmux %s\\n' "$*" >> "$log"
case "$1" in
  display-message) printf '%s\\n' "\${FAKE_TMUX_CURRENT:-}" ;;
  has-session) exit "\${FAKE_TMUX_HAS_SESSION_EXIT:-1}" ;;
  list-windows) printf '%s\\n' \${FAKE_TMUX_WINDOWS:-} ;;
  send-keys) if [ -n "\${FAKE_TMUX_SEND_KEYS_FAIL_TARGET:-}" ] && printf '%s' "$*" | grep -q "\${FAKE_TMUX_SEND_KEYS_FAIL_TARGET}"; then exit 1; fi ;;
esac
`,
      docker: `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'docker %s\\n' "$*" >> "$log"
if [ "$1" = "ps" ]; then printf '%s\\n' "\${FAKE_DOCKER_PS:-}"; fi
`,
      lsof: `#!/usr/bin/env bash
case "$*" in
  "-a -p "*" -d cwd -Fn")
    pid="$3"; cwd_var="FAKE_LSOF_CWD_\${pid}"; cwd="\${!cwd_var:-\${FAKE_LSOF_CWD:-}}"
    if [ -n "$cwd" ]; then printf 'p%s\\nn%s\\n' "$pid" "$cwd"; fi ;;
  *":3900"*) printf '%s\\n' "\${FAKE_LSOF_3900:-}" ;;
esac
`,
      ps: `#!/usr/bin/env bash
if [ "$*" = "-eo pid=,command=" ]; then printf '%b' "\${FAKE_PS_OUTPUT:-}"; fi
`,
      git: `#!/usr/bin/env bash
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then printf '%s' "$2"; exit 0; fi
printf 'unexpected git invocation: %s\\n' "$*" >&2
exit 1
`,
      dropdb: `#!/usr/bin/env bash
printf 'dropdb %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
      createdb: `#!/usr/bin/env bash
printf 'createdb %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
      pnpm: `#!/usr/bin/env bash
printf 'pnpm %s\\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
    }
    await Promise.all(
      Object.entries(files).map(([name, content]) => writeExecutable(join(dir, name), content)),
    )
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
      env: { ...process.env, ...env, FAKE_COMMAND_LOG: logPath, PATH: `${binDir}:/usr/bin:/bin` },
    })
    return { log: await readLog(logPath), stderr: result.stderr, stdout: result.stdout }
  }

  async function cleanup() {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  }

  return { cleanup, makeFakeBin, makeRepo, runScript }
}
