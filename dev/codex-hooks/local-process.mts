import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const GIT_WORKTREE_OVERRIDE_ENV = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
])

export function gitEnvForCwd(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !GIT_WORKTREE_OVERRIDE_ENV.has(key)),
  )
}

export function gitCurrentBranch(cwd: string): string | undefined {
  try {
    const text = execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      env: gitEnvForCwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim()
    return text === '' ? undefined : text
  } catch {
    return undefined
  }
}

export function gitConfigValue(cwd: string, key: string): string | undefined {
  try {
    const text = execFileSync('git', ['config', '--get', key], {
      cwd,
      encoding: 'utf8',
      env: gitEnvForCwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    }).trim()
    return text === '' ? undefined : text
  } catch {
    return undefined
  }
}

// `git merge-base --is-ancestor` is exit-code-only: 0 = ancestor, 1 = provably not, anything else
// (128 for an unknown ref, a timeout, git missing) is indeterminate. The hook fails open on genuine
// errors while still resolving the true/false case the caller needs to block on.
export function gitIsAncestor(
  cwd: string,
  ancestor: string,
  descendant: string,
): boolean | undefined {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      env: gitEnvForCwd(),
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 5_000,
    })
    return true
  } catch (error) {
    return (error as { status?: number | null }).status === 1 ? false : undefined
  }
}

export function gitRemoteVerbose(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['remote', '-v'], {
      cwd,
      encoding: 'utf8',
      env: gitEnvForCwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    })
  } catch {
    return undefined
  }
}

// `git config --get-regexp` exits 1 when nothing matches, which is an empty answer, not a failure.
export function gitConfiguredRemoteDefaults(cwd: string): string | undefined {
  try {
    return execFileSync('git', ['config', '--get-regexp', '^remote\\..+\\.gh-resolved$'], {
      cwd,
      encoding: 'utf8',
      env: gitEnvForCwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    })
  } catch (error) {
    return (error as { status?: number | null }).status === 1 ? '' : undefined
  }
}

export function gitHeadPathExists(cwd: string, relativePath: string): boolean {
  try {
    execFileSync('git', ['show', `HEAD:${relativePath}`], {
      cwd,
      env: gitEnvForCwd(),
      stdio: 'ignore',
      timeout: 5_000,
    })
    return true
  } catch {
    return false
  }
}

// Hook failures are advisory: preserve the existing behavior of warning only when oxfmt ran and
// reported a non-zero exit status, while ignoring spawn errors.
export function oxfmtFailure(cwd: string, filePath: string): string | undefined {
  const localBin = join(cwd, 'node_modules', '.bin', 'oxfmt')
  const result = existsSync(localBin)
    ? spawnSync(join(cwd, 'node_modules', '.bin', 'oxfmt'), [filePath], {
        cwd,
        encoding: 'utf8',
      })
    : spawnSync('oxfmt', [filePath], { cwd, encoding: 'utf8' })
  return result.error != null || result.status === 0 ? undefined : (result.stderr ?? '').trim()
}

export function playwrightSpecsContain(cwd: string, value: string): boolean {
  const result = spawnSync('grep', ['-rlF', '--', value, 'playwright/tests'], {
    cwd,
    encoding: 'utf8',
  })
  return Boolean(result.stdout?.trim())
}
