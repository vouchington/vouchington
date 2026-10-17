import {
  enableQueryCapture,
  disableQueryCapture,
  getCapturedQueries,
  clearCapturedQueries,
  extractQueryName,
  read,
  type ExplainPlanCacheMode,
  type ExplainResult,
} from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { assertRequiredPlanShape, assertScenarioFunctionCalls } from './plan-gates.mts'
import { ensureScenarioContract } from './plan-expectations.mts'
import { seedUuid } from './seed-data/common.mts'
import { withSeedAnchorClock } from './seed-clock.mts'
import { SEED_ANCHOR_DATE_ENV } from './seed-data/seed-anchor.mts'
import {
  captureScenarioTwice,
  resetRepeatedResults,
  writeSecondPassResults,
} from './capture-passes.mts'

export const SEED_PREFIX = '019e0000'
export const OUTPUT_DIR = join(import.meta.dirname, 'output')

export const seedUser = {
  __entity_type: 'user' as const,
  id: `${SEED_PREFIX}-0100-7000-8000-000000000000`,
  username: 'seeduser0',
  roles: [] as readonly string[],
} as PrivateUser

export const heavyFollowUser = {
  __entity_type: 'user' as const,
  id: `${SEED_PREFIX}-0100-7000-8000-000000000001`,
  username: 'seeduser1',
  roles: [] as readonly string[],
} as PrivateUser

// Posts carry per-day timestamps (seed-data/common.mts); this names a seeded post's id.
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
  resetRepeatedResults()
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

// Both processes need the same seed anchor; a UTC rollover can make a derived post id miss.
// Zero-row SQL still counts as captured, so verify the seeded anchor before profiling.
export async function assertSeedAnchorMatches(postId: string = seedPostId): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeAssertSeedAnchor */ SELECT id FROM posts WHERE id = $1`,
    [postId],
  )
  if (rows.length === 0) {
    const pinnedDay = process.env.EXPLAIN_SEED_ANCHOR_DATE
    const anchorSource =
      pinnedDay === undefined
        ? `${SEED_ANCHOR_DATE_ENV} is unset, so a UTC midnight between the two process runs splits them`
        : `${SEED_ANCHOR_DATE_ENV}=${pinnedDay} here; the seed step must have been given the same day`
    throw new Error(
      `Seed anchor post ${postId} not found. seed.mts and run.mts derived different day ` +
        `anchors (${anchorSource}), or the seed step did not complete.`,
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
  captureQueryName?: string | readonly string[],
  explainOptions: {
    localSettings?: Readonly<Record<string, string>>
    afterCapture?: () => Promise<void>
    exactCapturedNames?: readonly string[]
  } = {},
): Promise<void> {
  ensureScenarioContract(label)
  console.log(`Running: ${label}`)
  clearCapturedQueries()
  enableQueryCapture()

  try {
    await withSeedAnchorClock(fn)
  } finally {
    disableQueryCapture()
  }

  const allCaptured = getCapturedQueries()
  if (
    explainOptions.exactCapturedNames &&
    JSON.stringify(allCaptured.map(query => extractQueryName(query.text))) !==
      JSON.stringify(explainOptions.exactCapturedNames)
  )
    throw new Error(`${label} did not capture exactly the expected operation statements`)
  await explainOptions.afterCapture?.()
  const selectedNames = typeof captureQueryName === 'string' ? [captureQueryName] : captureQueryName
  const captured = selectedNames
    ? allCaptured.filter(query => selectedNames.includes(extractQueryName(query.text) ?? ''))
    : allCaptured
  console.log(
    `  Captured ${captured.length}${captureQueryName ? `/${allCaptured.length} ${captureQueryName} queries` : ' queries'}`,
  )
  assertCapturedQueries(label, captured)

  const inputs = captured.flatMap((cq, captureIndex) => {
    const baseName = extractQueryName(cq.text) ?? label
    return getExplainPlanCacheModes().map(planCacheMode => {
      const suffixes = [nameSuffix, planCacheMode === 'auto' ? undefined : planCacheMode].filter(
        Boolean,
      )
      return {
        name: suffixes.length > 0 ? `${baseName}:${suffixes.join(':')}` : baseName,
        text: cq.text,
        values: cq.values,
        scenarioId: label,
        captureIndex,
        planCacheMode,
        localSettings: explainOptions.localSettings,
      }
    })
  })
  const secondResults = await captureScenarioTwice(inputs, collectAndGate)
  assertScenarioFunctionCalls(label, results)
  assertScenarioFunctionCalls(label, secondResults)
  completedScenarioIds.push(label)
}

export function writeResults() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = join(OUTPUT_DIR, `results-${timestamp}.json`)
  writeFileSync(outputPath, JSON.stringify({ results, completedScenarioIds }, null, 2))
  writeSecondPassResults(outputPath, completedScenarioIds)
  console.log(`\nResults written to: ${outputPath}`)
  console.log(`Total queries explained: ${results.length}`)
}
