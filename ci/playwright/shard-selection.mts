import { globSync } from 'node:fs'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { isRunnablePlaywrightSpec } from '../test-plan.mts'

export { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'

export const PLAYWRIGHT_ESTIMATED_SECONDS_PER_SPEC = 12
// Allocation heuristic, not a per-spec SLA: this is an initial public 4-vCPU, three-worker
// candidate projected from the private-runner baseline. The whole playwright-tests job (build +
// migrate + compile + test) targets a sub-ten-minute runtime, not just the test step. At the current
// runnable spec count (318), 318 * 12 seconds / 300 seconds rounds to 13 shards. Public-runner
// measurements must validate or retune this allocation; the execution budget leaves room for fixed
// per-shard build and startup overhead.
export const PLAYWRIGHT_EXECUTION_BUDGET_SECONDS = 300
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

export function runnablePlaywrightSpecCount(worktreeRoot: string): number {
  return globSync('playwright/tests/**/*', { cwd: worktreeRoot }).filter(isRunnablePlaywrightSpec)
    .length
}

type PlaywrightSelectionInput =
  | {
      mode: 'full'
      fullSuiteSpecCount: number
      reason: string
      shardTotalOverride?: string
    }
  | {
      mode: 'selected'
      selectedFiles: readonly string[]
      reason: string
      shardTotalOverride?: string
    }

export interface PlaywrightSelectionOutputs {
  skip: 'true' | 'false'
  fullSuite: 'true' | 'false'
  files: string[]
  shardTotal: string
  reason: string
}

export function playwrightSelectionOutputs(
  input: PlaywrightSelectionInput,
): PlaywrightSelectionOutputs {
  if (input.mode === 'full') {
    return {
      skip: 'false',
      fullSuite: 'true',
      files: [],
      shardTotal: String(playwrightShardTotal(input.fullSuiteSpecCount, input.shardTotalOverride)),
      reason: input.reason,
    }
  }

  const files = input.selectedFiles.filter(isRunnablePlaywrightSpec)
  validatedShardTotalOverride(input.shardTotalOverride)
  if (files.length === 0) {
    return {
      skip: 'true',
      fullSuite: 'false',
      files: [],
      shardTotal: '1',
      reason: 'skip - no affected tests',
    }
  }
  return {
    skip: 'false',
    fullSuite: 'false',
    files,
    shardTotal: String(playwrightShardTotal(files.length, input.shardTotalOverride)),
    reason: input.reason,
  }
}
