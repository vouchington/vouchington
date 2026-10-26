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
