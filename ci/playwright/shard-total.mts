import { appendFileSync, globSync } from 'node:fs'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'

export { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'

// Hosted-runner measurement: full-suite PR runs average about 6.1 seconds of test-step time per
// spec with three Playwright workers.
export const PLAYWRIGHT_ESTIMATED_SECONDS_PER_SPEC = 6.1
// Allocation heuristic, not a per-spec SLA: this is the average per-shard test-execution budget the
// shard-total formula below solves against. Playwright's --shard splits by test count, not time, and
// the alphabetically last shards hold the heaviest specs (topics/), so the slowest shard runs about
// 1.25x the average (merge-queue runs, 2026-11-23: 999 s of summed test time against a 803 s mean at
// eight shards). The "Run Playwright tests" step adds about 35 seconds of server startup and is
// killed at 480 seconds. A 200-second average puts the heaviest shard near 285 seconds, about 40%
// under that kill. The previous 300-second budget (eight shards) left the heaviest at a median of
// 364 seconds, 24% under it, so a runner that was 1.3x slower killed shards whose tests all passed.
// The current full suite resolves to eleven shards.
export const PLAYWRIGHT_EXECUTION_BUDGET_SECONDS = 200

export function isRunnablePlaywrightSpec(file: string): boolean {
  return file.startsWith('playwright/tests/') && file.endsWith('.spec.mts')
}

function validatedShardTotalOverride(override?: string): number | undefined {
  if (override === undefined || override === '') return undefined
  if (!/^[1-9]\d*$/.test(override)) {
    throw new Error(
      `Playwright shard-total override must be a positive integer, got: '${override}'`,
    )
  }
  const parsedOverride = Number(override)
  if (parsedOverride > GITHUB_MATRIX_MAX_JOBS) {
    throw new Error(
      `Playwright shard-total override must not exceed ${GITHUB_MATRIX_MAX_JOBS}, got: ${parsedOverride}`,
    )
  }
  return parsedOverride
}

export function playwrightShardTotal(specFileCount: number, override?: string): number {
  if (!Number.isInteger(specFileCount) || specFileCount < 0) {
    throw new Error(
      `runnable Playwright spec count must be a non-negative integer, got: ${specFileCount}`,
    )
  }

  const overrideTotal = validatedShardTotalOverride(override)
  if (overrideTotal !== undefined) return overrideTotal

  const shardTotal = Math.max(
    1,
    Math.ceil(
      (specFileCount * PLAYWRIGHT_ESTIMATED_SECONDS_PER_SPEC) / PLAYWRIGHT_EXECUTION_BUDGET_SECONDS,
    ),
  )
  if (shardTotal > GITHUB_MATRIX_MAX_JOBS) {
    throw new Error(
      `computed Playwright shard total must not exceed ${GITHUB_MATRIX_MAX_JOBS}, got: ${shardTotal}`,
    )
  }
  return shardTotal
}

export function shardMatrix(shardTotal: number): number[] {
  return Array.from({ length: shardTotal }, (_, index) => index + 1)
}

export function runnablePlaywrightSpecCount(worktreeRoot: string): number {
  return globSync('playwright/tests/**/*', { cwd: worktreeRoot }).filter(isRunnablePlaywrightSpec)
    .length
}

if (import.meta.main) {
  const total = playwrightShardTotal(
    runnablePlaywrightSpecCount(process.env['GITHUB_WORKSPACE'] ?? process.cwd()),
    process.env['SHARD_TOTAL_OVERRIDE'],
  )
  const outputs = `shard-total=${total}\nshard-matrix=${JSON.stringify(shardMatrix(total))}\n`
  const output = process.env['GITHUB_OUTPUT']
  if (output) appendFileSync(output, outputs)
  console.log(outputs.trimEnd())
}
