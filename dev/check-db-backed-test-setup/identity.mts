import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type WorktreeResourceIdentity = {
  isMainWorktree: boolean
  worktreeDir: string
}

const helperPath = fileURLToPath(new URL('../lib/worktree-resource-env.sh', import.meta.url))
const identityScript = 'source "$1"; worktree_resource_identity_record "$2"'

export function readWorktreeResourceIdentity(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): WorktreeResourceIdentity {
  let output: string
  try {
    output = execFileSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-c',
        identityScript,
        'worktree-resource-identity',
        helperPath,
        repoRoot,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, ...env, BASH_ENV: '/dev/null' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  } catch (err) {
    if (isNonRepositoryRoot(repoRoot) && isMissingCommandError(err)) {
      return { isMainWorktree: false, worktreeDir: basename(realpathSync(repoRoot)) }
    }
    throw err
  }
  const separator = output.indexOf('\n')
  if (separator === -1) {
    throw new Error('worktree resource identity helper returned an invalid record')
  }

  const kind = output.slice(0, separator)
  const worktreeDir = output.slice(separator + 1)
  if ((kind !== 'main' && kind !== 'non-main') || !worktreeDir) {
    throw new Error('worktree resource identity helper returned an invalid record')
  }
  if (
    kind === 'non-main' &&
    !/^d[0-9a-f]{12}$/.test(worktreeDir) &&
    !isNonRepositoryRoot(repoRoot)
  ) {
    throw new Error('worktree resource identity helper returned an invalid non-main identity')
  }

  return { isMainWorktree: kind === 'main', worktreeDir }
}

function isNonRepositoryRoot(repoRoot: string): boolean {
  return !existsSync(resolve(repoRoot, '.git'))
}

function isMissingCommandError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
