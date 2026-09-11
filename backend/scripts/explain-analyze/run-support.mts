import {
  enableQueryCapture,
  disableQueryCapture,
  getCapturedQueries,
  clearCapturedQueries,
  explainAnalyze,
  extractQueryName,
  read,
  type ExplainPlanCacheMode,
  type ExplainResult,
} from '@data-stores/psql'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { assertRequiredPlanShape } from './plan-gates.mts'
import { seedUuid } from './seed-data/common.mts'

export const SEED_PREFIX = '019e0000'
export const OUTPUT_DIR = join(import.meta.dirname, 'output')

export const seedUser = {
  __entity_type: 'user' as const,
  id: `${SEED_PREFIX}-0100-7000-8000-000000000000`,
  username: 'seeduser0',
  roles: [] as readonly string[],
}

export const heavyFollowUser = {
  __entity_type: 'user' as const,
  id: `${SEED_PREFIX}-0100-7000-8000-000000000001`,
  username: 'seeduser1',
  roles: [] as readonly string[],
}

export const seedSessionId = `${SEED_PREFIX}-1100-7000-8000-000000000000`
// posts moved off the fixed SEED_PREFIX instant onto a per-day real-clock timestamp (see
// seed-data/common.mts); this is the only way to name a specific seeded post's id from here.
export const seedPostId = seedUuid(0, '05')
export const seedTopicId = `${SEED_PREFIX}-0400-7000-8000-000000000000`
export const seedParentTopicId = `${SEED_PREFIX}-0400-7000-8000-0000000001f4`
export const seedHostnameIds = [
  `${SEED_PREFIX}-0200-7000-8000-000000000000`,
  `${SEED_PREFIX}-0200-7000-8000-000000000001`,
  `${SEED_PREFIX}-0200-7000-8000-000000000002`,
]

const results: ExplainResult[] = []
const completedScenarioIds: string[] = []

export function collectAndGate(result: ExplainResult): void {
  results.push(result)
  assertRequiredPlanShape(result)
}

export function getResults(): readonly ExplainResult[] {
  return results
}

export function resetResults(): void {
  results.length = 0
}

export function assertCapturedQueries(
  label: string,
  captured: readonly { text: string; values: readonly unknown[] }[],
): void {
  if (captured.length === 0) {
    throw new Error(`${label} captured no queries`)
  }
}

export function assertScenarioManifest(
  completed: readonly string[],
  expected: readonly string[],
): void {
  const completedSet = new Set(completed)
  const expectedSet = new Set(expected)
  const missing = expected.filter(id => !completedSet.has(id))
  const unexpected = completed.filter(id => !expectedSet.has(id))
  const duplicates = completed.filter((id, index) => completed.indexOf(id) !== index)
  if (missing.length > 0 || unexpected.length > 0 || duplicates.length > 0) {
    throw new Error(
      `EXPLAIN scenario manifest mismatch; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}] duplicates=[${[...new Set(duplicates)].join(', ')}]`,
    )
  }
}

export function getCompletedScenarioIds(): readonly string[] {
  return completedScenarioIds
}

// seed.mts and run.mts are separate `node` process invocations (see seed-data/common.mts's
// getCurrentDayAnchorMs()); a UTC day rollover between them, or a seed step that silently didn't
// run, makes every seedUuid(_, '05')-derived id here miss its row. A scenario that queries a
// missing post by id still issues exactly one query matching zero rows, which
// assertCapturedQueries can't distinguish from a real profiled query — so that failure mode is
// otherwise silent. Check the anchor once, up front, instead of leaving it undetectable.
export async function assertSeedAnchorMatches(postId: string = seedPostId): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeAssertSeedAnchor */ SELECT id FROM posts WHERE id = $1`,
    [postId],
  )
  if (rows.length === 0) {
    throw new Error(
      `Seed anchor post ${postId} not found. seed.mts and run.mts derived different day ` +
        `anchors (likely a UTC day rollover between the two process runs), or the seed step did ` +
        `not complete.`,
    )
  }
}

export function getExplainPlanCacheModes(
  mode: string | undefined = process.env.EXPLAIN_PLAN_CACHE_MODE,
): ExplainPlanCacheMode[] {
  if (mode === undefined || mode === '' || mode === 'auto') return ['auto']
  if (mode === 'compare') return ['force_custom_plan', 'force_generic_plan']
  if (mode === 'force_custom_plan' || mode === 'force_generic_plan') return [mode]
  throw new Error(`Invalid EXPLAIN_PLAN_CACHE_MODE: "${mode}"`)
}

export function prepareOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

export async function runAndCapture(
  label: string,
  fn: () => Promise<unknown>,
  nameSuffix?: string,
  captureQueryName?: string,
): Promise<void> {
  console.log(`Running: ${label}`)
  clearCapturedQueries()
  enableQueryCapture()

  try {
    await fn()
  } finally {
    disableQueryCapture()
  }

  const allCaptured = getCapturedQueries()
  const captured = captureQueryName
    ? allCaptured.filter(query => extractQueryName(query.text) === captureQueryName)
    : allCaptured
  console.log(
    `  Captured ${captured.length}${captureQueryName ? `/${allCaptured.length} ${captureQueryName} queries` : ' queries'}`,
  )
  assertCapturedQueries(label, captured)

  for (const [captureIndex, cq] of captured.entries()) {
    const baseName = extractQueryName(cq.text) ?? label
    for (const planCacheMode of getExplainPlanCacheModes()) {
      const suffixes = [nameSuffix, planCacheMode === 'auto' ? undefined : planCacheMode].filter(
        Boolean,
      )
      const name = suffixes.length > 0 ? `${baseName}:${suffixes.join(':')}` : baseName
      const result = await explainAnalyze(name, cq.text, cq.values, { planCacheMode })
      result.scenario_id = label
      result.capture_index = captureIndex
      collectAndGate(result)
      console.log(
        `  [${name}] exec=${result.execution_time_ms.toFixed(1)}ms plan=${result.planning_time_ms.toFixed(1)}ms`,
      )
    }
  }
  completedScenarioIds.push(label)
}

export function writeResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = join(OUTPUT_DIR, `results-${timestamp}.json`)
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nResults written to: ${outputPath}`)
  console.log(`Total queries explained: ${results.length}`)
}
