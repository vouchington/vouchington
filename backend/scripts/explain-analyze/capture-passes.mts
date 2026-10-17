import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import {
  explainAnalyze,
  write,
  type ExplainPlanCacheMode,
  type ExplainResult,
} from '@data-stores/psql'
import { assertRequiredPlanShape } from './plan-gates.mts'
import { hasLaunchedParallelWorkers } from './plan-node-stats.mts'
import { getScenarioContract } from './plan-expectations.mts'
import { getLargeTableRelations, getLargeTableSeqScanRelations } from './plan-warnings.mts'
import { getExplainResultIdentity, SEQ_SCAN_BASELINE } from './seq-scan-baseline.mts'
import { costWithoutSeqScan, forcedSeqScan, type ProbedExplainResult } from './seq-scan-ties.mts'

export type Capture = {
  name: string
  text: string
  values: readonly unknown[]
  scenarioId: string
  captureIndex: number
  planCacheMode: ExplainPlanCacheMode
  localSettings?: Readonly<Record<string, string>>
}

const repeatedResults: ExplainResult[] = []
const seedPlanDiagnosticScenarios = new Set([
  'recommended-topics',
  'rss-feed-item-feed-related-posts',
  'topic-metrics-batch',
  'topic-search-text',
])

export function resetRepeatedResults(): void {
  repeatedResults.length = 0
}

// The paired captures share one database, so they cannot show that a sequential scan is a coin
// flip across databases. Price the same statement without sequential scans, plan only, so the
// gate can tell a near-tie from a missing index (see seq-scan-ties.mts).
async function probeSeqScanAlternative(input: Capture, result: ProbedExplainResult) {
  const scannedRelations = getLargeTableSeqScanRelations(result)
  await probeBaselinedScans(input, result, scannedRelations)
  if (scannedRelations.length === 0) return
  const probe = await explainAnalyze(input.name, input.text, input.values, {
    localSettings: { ...input.localSettings, enable_seqscan: 'off' },
    planCacheMode: input.planCacheMode,
    planOnly: true,
  })
  result.no_seq_scan_total_cost = costWithoutSeqScan(probe.plan, scannedRelations)
}

// The mirror image: a baselined scan the planner skipped this run may only have lost a coin flip.
// Plan the statement plan-only with every index path disabled; a forced scan priced within
// SEQ_SCAN_TIE_RATIO of the chosen plan keeps the stale entry advisory.
export async function probeBaselinedScans(
  input: Capture,
  result: ProbedExplainResult,
  scannedRelations: readonly string[],
  plan: typeof explainAnalyze = explainAnalyze,
  baseline: Readonly<Record<string, readonly string[]>> = SEQ_SCAN_BASELINE,
) {
  const baselined = (baseline[getExplainResultIdentity(result)] ?? []).filter(
    relation => !scannedRelations.includes(relation),
  )
  if (baselined.length === 0) return
  const forced = await plan(input.name, input.text, input.values, {
    localSettings: {
      ...input.localSettings,
      enable_indexscan: 'off',
      enable_bitmapscan: 'off',
      enable_indexonlyscan: 'off',
    },
    planCacheMode: input.planCacheMode,
    planOnly: true,
  })
  const scans = Object.fromEntries(
    baselined.flatMap(relation => {
      const scan = forcedSeqScan(forced.plan, relation)
      return scan ? [[relation, scan]] : []
    }),
  )
  if (Object.keys(scans).length > 0) result.forced_seq_scans = scans
}

async function capturePlan(input: Capture, pass: 1 | 2): Promise<ExplainResult> {
  if (seedPlanDiagnosticScenarios.has(input.scenarioId)) {
    const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
    console.log(
      'EXPLAIN seed input:',
      JSON.stringify({
        scenarioId: input.scenarioId,
        name: input.name,
        captureIndex: input.captureIndex,
        planCacheMode: input.planCacheMode,
        pass,
        sqlSha256: sha256(input.text),
        valuesSha256: sha256(
          JSON.stringify(input.values, (_, value: unknown) =>
            typeof value === 'bigint' ? `bigint:${value}` : value,
          ),
        ),
      }),
    )
  }
  const result = await explainAnalyze(input.name, input.text, input.values, {
    localSettings: input.localSettings,
    planCacheMode: input.planCacheMode,
  })
  if (
    getScenarioContract(input.scenarioId).expectations.some(
      expectation => expectation.kind === 'maxFunctionCalls',
    )
  ) {
    // Keep the plan capture and its shape gates on the caller's settings. PostgreSQL's
    // transaction-local function counters omit calls in parallel worker backends.
    const serial = await explainAnalyze(input.name, input.text, input.values, {
      localSettings: { ...input.localSettings, max_parallel_workers_per_gather: '0' },
      planCacheMode: input.planCacheMode,
    })
    if (hasLaunchedParallelWorkers(serial.plan))
      throw new Error(`${input.name} launched parallel workers during serial function-call capture`)
    result.function_calls = serial.function_calls
    result.function_calls_serial = true
  }
  result.scenario_id = input.scenarioId
  result.capture_index = input.captureIndex
  await probeSeqScanAlternative(input, result)
  return result
}

export async function captureScenarioTwice(
  inputs: readonly Capture[],
  collectFirst: (result: ExplainResult) => void,
): Promise<readonly ExplainResult[]> {
  const firstResults: ExplainResult[] = []
  const secondResults: ExplainResult[] = []
  for (const input of inputs) {
    const result = await capturePlan(input, 1) // no-mistakes-disable-line query-reached-per-item: each captured fixture statement needs its own serial transaction-local EXPLAIN plan
    collectFirst(result)
    firstResults.push(result)
    console.log(
      `  [${input.name}] exec=${result.execution_time_ms.toFixed(1)}ms plan=${result.planning_time_ms.toFixed(1)}ms`,
    )
  }

  // No fixture row change is committed between passes. Every EXPLAIN runs in a rolled-back
  // transaction, while the service callback and fixture cleanup run only before this pair.
  const relations = [...new Set(firstResults.flatMap(getLargeTableRelations))].toSorted()
  // getLargeTableRelations only returns parents from the fixed large-table registry (at most 22).
  if (relations.length > 0) {
    const names = relations.map(relation => `"${relation.replaceAll('"', '""')}"`).join(', ')
    await write(`/* explainSeqScanStability */ ANALYZE ${names}`)
  }

  for (const input of inputs) {
    const result = await capturePlan(input, 2) // no-mistakes-disable-line query-reached-per-item: repeat the same bounded scenario/mode plan on its transaction client for stability comparison
    repeatedResults.push(result)
    secondResults.push(result)
    assertRequiredPlanShape(result)
  }
  return secondResults
}

export function writeSecondPassResults(firstPath: string, completedScenarioIds: readonly string[]) {
  const secondPath = firstPath.replace(/\/results-([^/]+)\.json$/, '/repeat-$1.json')
  if (secondPath === firstPath) throw new Error('Unexpected first EXPLAIN result path')
  writeFileSync(
    secondPath,
    JSON.stringify({ results: repeatedResults, completedScenarioIds }, null, 2),
  )
  console.log(`Repeated EXPLAIN results written to: ${secondPath}`)
}
