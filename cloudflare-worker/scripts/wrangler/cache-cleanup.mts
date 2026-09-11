import { existsSync, rmSync } from 'node:fs'
import { getStaleWranglerCachePaths } from './config.mts'
import type { WranglerRuntimePaths } from './runtime.mts'

export function clearStaleWranglerCaches(options: {
  isCi: boolean
  persistTo?: string
  runtimePaths?: WranglerRuntimePaths
  workerDir: string
  log?: (message: string) => void
}): string[] {
  const cleared: string[] = []
  for (const cachePath of getStaleWranglerCachePaths(options)) {
    if (!existsSync(cachePath)) continue
    rmSync(cachePath, { force: true, recursive: true })
    cleared.push(cachePath)
  }

  if (cleared.length > 0) {
    options.log?.(`Cleared stale test caches: ${cleared.join(', ')}`)
  }

  return cleared
}
