import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { type RunProcessResult, runProcess } from './run-process.mts'

const execFileAsync = promisify(execFile)
const initializePath = fileURLToPath(new URL('../initialize', import.meta.url))
const worktreeResourceEnvPath = fileURLToPath(
  new URL('../lib/worktree-resource-env.sh', import.meta.url),
)
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

// Runs `script` after sourcing `sourcePath`, reporting the child's real exit code,
// signal, and timeout state instead of masking every failure as exit code 1.
export async function runSourcedBash(
  sourcePath: string,
  script: string,
  args: string[] = [],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<RunProcessResult> {
  const result = await runProcess('bash', sourceBashArgs(sourcePath, script, args), opts)
  return { ...result, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
}

// Runs `script` against dev/lib/worktree-resource-env.sh in a fixture git toplevel,
// preparing the `.git` marker for a main checkout or a worktree as requested.
export async function runWorktreeResourceEnv({
  gitToplevel,
  isMainWorktree,
  processTmpdir,
  script,
}: {
  gitToplevel: string
  isMainWorktree: boolean
  processTmpdir?: string
  script: string
}): Promise<RunProcessResult> {
  if (isMainWorktree) {
    await mkdir(join(gitToplevel, '.git'), { recursive: true })
  } else {
    await writeFile(join(gitToplevel, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
  }

  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  if (processTmpdir !== undefined) {
    env.TMPDIR = processTmpdir
  }

  return runSourcedBash(worktreeResourceEnvPath, script, [], { cwd: gitToplevel, env })
}

// Runs `script` via dev/initialize's bash entry point under a fixture HOME, reporting
// the child's real exit code, signal, and timeout state.
export async function runInitializeHelperStatus({
  cwd,
  script,
  home,
}: {
  cwd: string
  script: string
  home?: string
}): Promise<RunProcessResult> {
  const result = await runProcess('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })
  return { ...result, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
}

// Runs `script` via dev/initialize's bash entry point under a fixture HOME, returning trimmed
// stdout and rejecting when the script exits non-zero.
export async function runInitializeScript({
  cwd,
  script,
  env = {},
}: {
  cwd: string
  script: string
  env?: NodeJS.ProcessEnv
}): Promise<string> {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: { ...process.env, ...env, HOME: dirname(cwd) },
  })
  return result.stdout.trim()
}

// Shell assignments for the ports, Valkey container, and secrets write_worktree_env writes to .env.
export function worktreeEnvAssignments(worktreeDir: string): string {
  return [
    'VALKEY_PORT=6379',
    `WORKTREE_DIR=${worktreeDir}`,
    'BACKEND_PORT=3001',
    'VALKEY_CONTAINER=voucha-valkey-test',
    'WORKER_PORT=8788',
    'IMAGE_LAMBDA_PORT=4001',
    'NEXT_PORT=3002',
    'STORYBOOK_PORT=6006',
    'INSPECTOR_PORT=9229',
    'CF_WORKER_SECRET=secret',
    'API_KEY_CHECKSUM_SECRET=checksum',
    'VOUCHA_OTP_TOKEN_HASH_SECRET=otp',
    'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys',
    'FINAL_WEB_PUSH_PUBLIC_KEY=public',
    'FINAL_WEB_PUSH_PRIVATE_KEY=private',
    'FINAL_WEB_PUSH_SUBJECT=mailto:tests+db-url@voucha.ai',
  ].join('\n')
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
