import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const initializePath = fileURLToPath(new URL('../initialize', import.meta.url))
const testDirs: string[] = []

export function initializeBashArgs(script: string, args: string[] = []): string[] {
  return sourceBashArgs(
    initializePath,
    `if [ -r "$REPO_ROOT/dev/lib/git-worktrees.sh" ]; then source "$REPO_ROOT/dev/lib/git-worktrees.sh"; fi; ${script}`,
    args,
    true,
  )
}

export function sourceBashArgs(
  sourcePath: string,
  script: string,
  args: string[] = [],
  silenceSource = false,
): string[] {
  return [
    '-c',
    `source "$1"${silenceSource ? ' >/dev/null 2>&1' : ''} || exit $?; shift; ${script}`,
    'voucha-source-test',
    sourcePath,
    ...args,
  ]
}

export async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

export async function runInitializeHelper({
  cwd,
  script,
  home,
  args = [],
  env = {},
  sourcePath = initializePath,
}: {
  cwd: string
  script: string
  home?: string
  args?: string[]
  env?: NodeJS.ProcessEnv
  sourcePath?: string
}) {
  const result = await execFileAsync('bash', sourceBashArgs(sourcePath, script, args, true), {
    cwd,
    env: {
      ...process.env,
      ...env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

export async function cleanupWorktreeDirs() {
  await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
}
