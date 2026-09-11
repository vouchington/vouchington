// Shared by the worker-exit diagnostics reporter (onTestRunEnd), the teardown-overrun
// diagnostics (onProcessTimeout), and the fork-exit sentinel (vitest-fork-exit-sentinel.mts) —
// all three snapshot a process's resource usage at a force-kill or exit boundary.
import { getHeapStatistics } from 'node:v8'

export function formatProcessResources(): string {
  const usage = process.resourceUsage()
  const memory = process.memoryUsage()
  const heapLimitBytes = getHeapStatistics().heap_size_limit
  return [
    `pid=${process.pid}`,
    `rssMB=${formatBytes(memory.rss)}`,
    `heapUsedMB=${formatBytes(memory.heapUsed)}`,
    `heapTotalMB=${formatBytes(memory.heapTotal)}`,
    // heap_size_limit and its ratio to heapUsed — not heapTotal, which is steady-state V8
    // bookkeeping and was previously misread as "occupancy" against a limit it never carried.
    `heapLimitMB=${formatBytes(heapLimitBytes)}`,
    `heapPctOfLimit=${formatPercent(memory.heapUsed, heapLimitBytes)}`,
    `userCpuMs=${Math.round(usage.userCPUTime / 1000)}`,
    `systemCpuMs=${Math.round(usage.systemCPUTime / 1000)}`,
  ].join(' ')
}

export function formatActiveResources(): string {
  const resources = process.getActiveResourcesInfo?.()
  if (!resources || resources.length === 0) return '(none)'
  return resources.slice(0, 20).join(', ')
}

// Also used by the fork-side leak detector (vitest-fork-leak-detection.mts) to compare
// per-type resource counts across checkpoints instead of the flat truncated list above.
export function countResourcesByType(resources: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const resource of resources) {
    counts.set(resource, (counts.get(resource) ?? 0) + 1)
  }
  return counts
}

export function formatResourceCounts(counts: ReadonlyMap<string, number>): string {
  if (counts.size === 0) return '(none)'
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}=${count}`)
    .join(' ')
}

// Exported for the fork-exit sentinel (vitest-fork-exit-sentinel.mts), which formats its own
// heapUsedMB/heapLimitMB/rssMB fields from a synchronous handler and needs identical rounding.
export function formatBytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

export function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.0'
  return ((numerator / denominator) * 100).toFixed(1)
}
