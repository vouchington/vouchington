import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  getWranglerPersistToPath as getSharedWranglerPersistToPath,
  getWranglerRuntimePaths,
} from '../cloudflare-worker/scripts/wrangler/runtime.mts'

export interface StaleTestCacheCleanupOptions {
  rootDir: string
  preserveNextBuildCache?: boolean
  clearNextRuntime?: boolean
  clearWranglerLocalState?: boolean
  wranglerPersistDirs?: string[]
  wranglerRuntimeDirs?: string[]
  log?: (message: string) => void
}

export function getWranglerRuntimeRoot(
  workerPort: string,
  runAttempt: string,
  tempRoot = process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir(),
): string {
  return getWranglerRuntimePaths({
    isCi: true,
    runAttempt,
    tempRoot,
    workerDir: '',
    workerPort,
  }).root
}

export function getWranglerPersistToPath(
  workerPort: string,
  runAttempt: string,
  tempRoot = process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir(),
): string {
  return getSharedWranglerPersistToPath(workerPort, runAttempt, tempRoot)
}

export function clearStaleTestCaches(options: StaleTestCacheCleanupOptions): string[] {
  const rootDir = resolve(options.rootDir)
  const cleared: string[] = []

  if (options.clearNextRuntime !== false) {
    const nextDir = join(rootDir, 'web', '.next')
    if (clearNextRuntimeDir(nextDir, Boolean(options.preserveNextBuildCache))) {
      cleared.push(relativeLabel(rootDir, nextDir))
    }
  }

  if (options.clearWranglerLocalState !== false) {
    const wranglerState = join(rootDir, 'cloudflare-worker', '.wrangler', 'state')
    if (removeDirIfPresent(wranglerState)) {
      cleared.push(relativeLabel(rootDir, wranglerState))
    }
    const wranglerRuntime = join(rootDir, 'cloudflare-worker', '.wrangler', 'runtime')
    if (removeDirIfPresent(wranglerRuntime)) {
      cleared.push(relativeLabel(rootDir, wranglerRuntime))
    }
  }

  for (const runtimeDir of options.wranglerRuntimeDirs ?? []) {
    if (removeDirIfPresent(runtimeDir)) {
      cleared.push(runtimeDir)
    }
  }

  for (const persistDir of options.wranglerPersistDirs ?? []) {
    if (removeDirIfPresent(persistDir)) {
      cleared.push(persistDir)
    }
  }

  if (cleared.length > 0) {
    options.log?.(`Cleared stale test caches: ${cleared.join(', ')}`)
  }

  return cleared
}

function clearNextRuntimeDir(nextDir: string, preserveBuildCache: boolean): boolean {
  if (!existsSync(nextDir)) return false

  const nextBuildCache = join(nextDir, 'cache')
  let preservedCache: string | null = null

  if (preserveBuildCache && existsSync(nextBuildCache)) {
    preservedCache = `${nextDir}.cache.tmp`
    rmSync(preservedCache, { force: true, recursive: true })
    renameSync(nextBuildCache, preservedCache)
  }

  rmSync(nextDir, { force: true, recursive: true })

  if (preservedCache !== null) {
    mkdirSync(dirname(nextBuildCache), { recursive: true })
    renameSync(preservedCache, nextBuildCache)
  }

  return true
}

function removeDirIfPresent(path: string): boolean {
  if (!existsSync(path)) return false
  rmSync(path, { force: true, recursive: true })
  return true
}

function relativeLabel(rootDir: string, absolutePath: string): string {
  return absolutePath.startsWith(`${rootDir}/`)
    ? absolutePath.slice(rootDir.length + 1)
    : absolutePath
}
