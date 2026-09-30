import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const devDir = fileURLToPath(new URL('..', import.meta.url))
const stopServicesPath = join(devDir, 'stop-services')
const resetPath = join(devDir, 'reset')
const dbCleanPath = join(devDir, 'db-clean')
const refuseOnMainPath = join(devDir, 'lib/refuse-on-main.sh')
const dbNameFromUrlPath = join(devDir, 'lib/db-name-from-url.sh')
const dbTargetPath = join(devDir, 'lib/db-target.sh')
const flushValkeyPath = join(devDir, 'lib/flush-valkey.sh')
const gitWorktreesPath = join(
  devDir,
  '../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
)

const fakeGitdir = 'gitdir: /fake/.git/worktrees/test\n'
const tmuxDbCleanStub = '#!/usr/bin/env bash\nprintf "db-clean\\n" >> "${FAKE_COMMAND_LOG:?}"\n'

const tmuxResourceEnv = `worktree_resource_clear_env() { unset PORT NEXT_PORT WEB_PORT WORKER_PORT IMAGE_LAMBDA_PORT INSPECTOR_PORT STORYBOOK_PORT VALKEY_URL VALKEY_SESSION_URL VALKEY_CACHE_URL VALKEY_RATE_LIMITER_URL VALKEY_DYNAMIC_CONFIG_URL VALKEY_WORKER_QUEUE_URL VALKEY_CONTAINER DATABASE_URL WORKTREE_DIR; }
worktree_resource_load_current_env() { worktree_resource_clear_env; [ -f "$1/.env" ] || return 1; set -a; source "$1/.env"; set +a; }; refuse_shared_resources_on_disposable() { :; }
`

const valkeyResourceEnv = `worktree_resource_clear_env() { unset PORT NEXT_PORT WEB_PORT WORKER_PORT IMAGE_LAMBDA_PORT INSPECTOR_PORT STORYBOOK_PORT VALKEY_URL VALKEY_SESSION_URL VALKEY_CACHE_URL VALKEY_RATE_LIMITER_URL VALKEY_DYNAMIC_CONFIG_URL VALKEY_WORKER_QUEUE_URL VALKEY_CONTAINER DATABASE_URL WORKTREE_DIR; }
worktree_resource_load_current_env() { worktree_resource_clear_env; [ -f "$1/.env" ] || return 1; set -a; source "$1/.env"; set +a; }
refuse_shared_resources_on_disposable() { :; }
`

type StopServicesRepoProfile = 'tmux' | 'valkey'

type StopServicesRepoOptions = {
  isMainWorktree?: boolean
  profile: StopServicesRepoProfile
  withEnv?: boolean
}

async function copyText(from: string, to: string) {
  await writeFile(to, await readFile(from, 'utf8'))
}

async function copyExecutable(from: string, to: string) {
  await copyText(from, to)
  await chmod(to, 0o755)
}

function dotEnv(profile: StopServicesRepoProfile, worktreeDir: string) {
  if (profile === 'tmux') {
    return `export PORT=3900
  export NEXT_PORT=3901
  export WORKER_PORT=3902
  export IMAGE_LAMBDA_PORT=3903
  export INSPECTOR_PORT=3904
  export VALKEY_CONTAINER=voucha-valkey-test
  export DATABASE_URL=postgres://localhost/voucha-test
  export WORKTREE_DIR=${worktreeDir}
  `
  }

  return `export PORT=3900
export NEXT_PORT=3901
export WORKER_PORT=3902
export IMAGE_LAMBDA_PORT=3903
export INSPECTOR_PORT=3904
export VALKEY_CONTAINER=voucha-valkey-test
export DATABASE_URL=postgres://localhost/voucha-test
export WORKTREE_DIR=${worktreeDir}
`
}

export async function makeStopServicesRepo(
  testDirs: string[],
  { isMainWorktree = false, profile, withEnv = true }: StopServicesRepoOptions,
) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-stop-services-'))
  testDirs.push(dir)
  const libDir = join(dir, 'dev', 'lib')
  await mkdir(libDir, { recursive: true })
  await mkdir(join(dir, 'backend'), { recursive: true })
  await copyExecutable(stopServicesPath, join(dir, 'dev', 'stop-services'))
  await copyExecutable(resetPath, join(dir, 'dev', 'reset'))
  if (profile === 'tmux') {
    await writeFile(join(dir, 'dev', 'db-clean'), tmuxDbCleanStub)
    await chmod(join(dir, 'dev', 'db-clean'), 0o755)
  } else {
    await copyExecutable(dbCleanPath, join(dir, 'dev', 'db-clean'))
    await copyText(dbTargetPath, join(libDir, 'db-target.sh'))
    await copyText(flushValkeyPath, join(libDir, 'flush-valkey.sh'))
  }
  await copyText(refuseOnMainPath, join(libDir, 'refuse-on-main.sh'))
  await copyText(dbNameFromUrlPath, join(libDir, 'db-name-from-url.sh'))
  await copyText(gitWorktreesPath, join(libDir, 'git-worktrees.sh'))
  await writeFile(
    join(libDir, 'worktree-resource-env.sh'),
    profile === 'tmux' ? tmuxResourceEnv : valkeyResourceEnv,
  )
  if (isMainWorktree) {
    await mkdir(join(dir, '.git'), { recursive: true })
  } else {
    await writeFile(join(dir, '.git'), fakeGitdir)
  }
  if (withEnv) {
    await writeFile(join(dir, '.env'), dotEnv(profile, basename(dir)))
  }
  return dir
}

export async function readLog(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function runScript({
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
