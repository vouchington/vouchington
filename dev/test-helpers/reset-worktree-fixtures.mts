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
const protectedCheckoutPath = join(scriptDir, 'lib/protected-checkout.sh')
const protectedCheckoutPathsPath = join(scriptDir, 'protected-checkout-paths.txt')
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
    ['protected-checkout.sh', protectedCheckoutPath],
  ] as const) {
    await writeFile(join(dir, 'dev', 'lib', name), await readFile(src, 'utf8'))
  }
  await writeFile(
    join(dir, 'dev', 'protected-checkout-paths.txt'),
    await readFile(protectedCheckoutPathsPath, 'utf8'),
  )
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

export function registerTestDir(dir: string) {
  testDirs.push(dir)
}
export async function cleanupResetWorktreeTestDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}
