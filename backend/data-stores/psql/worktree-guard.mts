import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function findRepoRoot(startDir: string, stopAt?: string): string | null {
  let dir = startDir
  while (true) {
    try {
      statSync(resolve(dir, '.git'))
      return dir
    } catch {
      // .git not found at this level
    }
    if (stopAt && dir === stopAt) return null
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function isNonMainWorktree(repoRoot: string): boolean {
  try {
    return !statSync(resolve(repoRoot, '.git')).isDirectory()
  } catch {
    return false
  }
}

function databaseNameFromConnectionString(connectionString: string): string | null {
  try {
    const url = new URL(connectionString)
    return decodeURIComponent(url.pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

function defaultModuleDir(): string {
  return import.meta.dirname
}

export type WorktreeConnectionDecision =
  | { allowedBecause: 'ci'; databaseName: string | null }
  | { allowedBecause: 'docker-host'; databaseName: string | null }
  | { allowedBecause: 'no-repo-root'; databaseName: string | null }
  | { allowedBecause: 'main-worktree'; databaseName: string | null; repoRoot: string }
  | { allowedBecause: 'worktree-database'; databaseName: string | null; repoRoot: string }

export function assertNotCrossWorktreeConnection(
  connectionString: string,
  { env = process.env, moduleDir }: { env?: NodeJS.ProcessEnv; moduleDir?: string } = {},
): WorktreeConnectionDecision {
  const databaseName = databaseNameFromConnectionString(connectionString)
  if (env.CI) return { allowedBecause: 'ci', databaseName }
  if (env.DOCKER_HOST_IP) return { allowedBecause: 'docker-host', databaseName }

  const repoRoot = findRepoRoot(moduleDir ?? defaultModuleDir())
  if (!repoRoot) return { allowedBecause: 'no-repo-root', databaseName }
  if (!isNonMainWorktree(repoRoot))
    return { allowedBecause: 'main-worktree', databaseName, repoRoot }

  if (databaseName === 'voucha') {
    throw new Error(
      `Cross-worktree database guard: refusing to connect to the main "voucha" database from a non-main worktree.\n` +
        `Resolved connection string targets database "${databaseName}".\n` +
        `Run ./dev/initialize web and source .env to configure a worktree-specific database.`,
    )
  }
  return { allowedBecause: 'worktree-database', databaseName, repoRoot }
}
