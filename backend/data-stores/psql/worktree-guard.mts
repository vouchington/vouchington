import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function findRepoRoot(startDir: string, stopAt?: string): string | null {
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

export function isNonMainWorktree(repoRoot: string): boolean {
  try {
    return !statSync(resolve(repoRoot, '.git')).isDirectory()
  } catch {
    return false
  }
}

export function databaseNameFromConnectionString(connectionString: string): string | null {
  try {
    const url = new URL(connectionString)
    return decodeURIComponent(url.pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

function defaultModuleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

export function assertNotCrossWorktreeConnection(
  connectionString: string,
  { env = process.env, moduleDir }: { env?: NodeJS.ProcessEnv; moduleDir?: string } = {},
): void {
  if (env.CI) return
  if (env.DOCKER_HOST_IP) return

  const repoRoot = findRepoRoot(moduleDir ?? defaultModuleDir())
  if (!repoRoot) return
  if (!isNonMainWorktree(repoRoot)) return

  const dbName = databaseNameFromConnectionString(connectionString)
  if (dbName === 'voucha') {
    throw new Error(
      `Cross-worktree database guard: refusing to connect to the main "voucha" database from a non-main worktree.\n` +
        `Resolved connection string targets database "${dbName}".\n` +
        `Run ./dev/initialize web and source .env to configure a worktree-specific database.`,
    )
  }
}
