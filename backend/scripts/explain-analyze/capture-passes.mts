import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import {
  explainAnalyze,
  write,
  type ExplainPlanCacheMode,
  type ExplainResult,
} from '@data-stores/psql'
import { assertRequiredPlanShape } from './plan-gates.mts'
import { getLargeTableRelations } from './plan-warnings.mts'

type Capture = {
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
  result.scenario_id = input.scenarioId
  result.capture_index = input.captureIndex
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
