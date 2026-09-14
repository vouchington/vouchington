import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = fileURLToPath(new URL('..', import.meta.url))
const resetWorktreePath = join(scriptDir, 'reset-worktree')
const teardownPath = join(scriptDir, 'teardown')
const stopServicesPath = join(scriptDir, 'stop-services')
const refuseOnMainPath = join(scriptDir, 'lib/refuse-on-main.sh')
const dbNameFromUrlPath = join(scriptDir, 'lib/db-name-from-url.sh')
const dbTargetPath = join(scriptDir, 'lib/db-target.sh')
const publishedHelper = 'node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh'
const gitWorktreesPath = join(scriptDir, '..', publishedHelper)
const gitWorktreesAdapterPath = join(scriptDir, 'lib/git-worktrees.sh')
const worktreeResourceEnvPath = join(scriptDir, 'lib/worktree-resource-env.sh')
const gitIndexLockPath = join(scriptDir, 'lib/git-index-lock.sh')
const tmuxNamePath = join(scriptDir, 'tmux-name')
const testDirs: string[] = []
export async function makeRepo({
  isMainWorktree = false,
  withEnv = true,
  withValkeyPort = true,
}: { isMainWorktree?: boolean; withEnv?: boolean; withValkeyPort?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-reset-worktree-'))
  testDirs.push(dir)
  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await mkdir(join(dir, 'node_modules/vouchington-tooling/scripts/worktree'), { recursive: true })
  await writeFile(join(dir, publishedHelper), await readFile(gitWorktreesPath, 'utf8'))
  await mkdir(join(dir, 'backend'), { recursive: true })
  for (const [name, src] of [
    ['reset-worktree', resetWorktreePath],
    ['teardown', teardownPath],
    ['stop-services', stopServicesPath],
    ['tmux-name', tmuxNamePath],
  ] as const) {
    await writeFile(join(dir, 'dev', name), await readFile(src, 'utf8'))
    await chmod(join(dir, 'dev', name), 0o755)
  }
  for (const [name, src] of [
    ['refuse-on-main.sh', refuseOnMainPath],
    ['db-name-from-url.sh', dbNameFromUrlPath],
    ['db-target.sh', dbTargetPath],
    ['git-worktrees.sh', gitWorktreesAdapterPath],
    ['git-worktrees-recovery.sh', join(scriptDir, 'lib/git-worktrees-recovery.sh')],
    ['worktree-resource-env.sh', worktreeResourceEnvPath],
    ['git-index-lock.sh', gitIndexLockPath],
  ] as const) {
    await writeFile(join(dir, 'dev', 'lib', name), await readFile(src, 'utf8'))
  }
  await writeFile(
    join(dir, 'dev', 'initialize'),
    `#!/usr/bin/env bash\nlog="\${FAKE_COMMAND_LOG:?}"\nprintf 'initialize %s\\n' "$*" >> "$log"\n`,
  )
  await chmod(join(dir, 'dev', 'initialize'), 0o755)
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
export WORKTREE_DIR=${isMainWorktree ? basename(dir) : 'ddeadbeefcafe'}
`,
    )
  }
  if (withEnv && withValkeyPort) {
    await writeFile(join(dir, '.valkey-port'), '3904\n')
  }
  return dir
}

export async function makeFakeBin({
  gitDirty = false,
  gitFetchFails = false,
  gitUntracked = '',
}: { gitDirty?: boolean; gitFetchFails?: boolean; gitUntracked?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-reset-worktree-bin-'))
  testDirs.push(dir)
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
if [ "$1" = "-C" ]; then
  _repo_path="$2"
  shift 2
fi
case "$*" in
  "rev-parse --show-toplevel")
    printf '%s' "\${_repo_path:-$(pwd)}"
    ;;
  "diff-index --quiet HEAD --")
    printf 'git diff-index --quiet HEAD --\\n' >> "$log"
    exit ${gitDirty ? 1 : 0}
    ;;
  "status --porcelain --untracked-files=normal")
    printf 'git status --porcelain\\n' >> "$log"
    printf '%b' ${JSON.stringify(gitUntracked)}
    ;;
  "fetch origin main")
    printf 'git fetch origin main\\n' >> "$log"
    exit ${gitFetchFails ? 1 : 0}
    ;;
  "branch --show-current")
    printf 'worktree-test\\n'
    ;;
  "worktree list --porcelain")
    printf 'worktree %s\\nbranch refs/heads/main\\n' "\${_repo_path:-/fake/main}"
    ;;
  "checkout -B "*)
    printf 'git %s\\n' "$*" >> "$log"
    ;;
  "reset --hard origin/main")
    printf 'git reset --hard origin/main\\n' >> "$log"
    ;;
  "clean -fd")
    printf 'git clean -fd\\n' >> "$log"
    ;;
  *)
    printf 'unexpected git invocation: %s\\n' "$*" >&2
    exit 1
    ;;
esac
`,
  )
  await chmod(join(dir, 'git'), 0o755)
  await writeFile(
    join(dir, 'openssl'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'openssl %s\\n' "$*" >> "$log"
if [ "$1" = rand ]; then printf 'cafef00d\\n'; else cat >/dev/null; printf 'deadbeefcafe%052d\\n' 0; fi
`,
  )
  await chmod(join(dir, 'openssl'), 0o755)
  await writeFile(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'docker %s\\n' "$*" >> "$log"
case "$1" in
  ps)
    case "$*" in
      *"-a"*) printf '%s\\n' "\${FAKE_DOCKER_PS_A:-}" ;;
      *) printf '%s\\n' "\${FAKE_DOCKER_PS:-}" ;;
    esac
    ;;
esac
`,
  )
  await chmod(join(dir, 'docker'), 0o755)
  await writeFile(
    join(dir, 'tmux'),
    `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf 'tmux %s\\n' "$*" >> "$log"
case "$1" in
  has-session) exit "\${FAKE_TMUX_HAS_SESSION_EXIT:-1}" ;;
  display-message)
    case "$*" in
      *"window_id"*) printf '@0\\n' ;;
      *) printf '%s\\n' "\${FAKE_TMUX_CURRENT:-}" ;;
    esac
    ;;
esac
`,
  )
  await chmod(join(dir, 'tmux'), 0o755)
  await writeFile(join(dir, 'lsof'), '#!/usr/bin/env bash\n: # no-op\n')
  await chmod(join(dir, 'lsof'), 0o755)
  await writeFile(join(dir, 'ps'), '#!/usr/bin/env bash\n: # no-op\n')
  await chmod(join(dir, 'ps'), 0o755)
  await writeFile(join(dir, 'sleep'), '#!/usr/bin/env bash\n: # no-op sleep\n')
  await chmod(join(dir, 'sleep'), 0o755)
  for (const cmd of ['dropdb', 'createdb', 'pnpm']) {
    await writeFile(
      join(dir, cmd),
      `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
printf '${cmd} %s\\n' "$*" >> "$log"
`,
    )
    await chmod(join(dir, cmd), 0o755)
  }
  return dir
}
export function registerTestDir(dir: string) {
  testDirs.push(dir)
}
export async function cleanupResetWorktreeTestDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}
