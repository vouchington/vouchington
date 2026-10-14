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

export function resetRepeatedResults(): void {
  repeatedResults.length = 0
}

async function capturePlan(input: Capture): Promise<ExplainResult> {
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
    const result = await capturePlan(input)
    collectFirst(result)
    firstResults.push(result)
    console.log(
      `  [${input.name}] exec=${result.execution_time_ms.toFixed(1)}ms plan=${result.planning_time_ms.toFixed(1)}ms`,
    )
  }

  // Only planner statistics change between passes. Every EXPLAIN executes in its own rolled-back
  // transaction, while the service callback and its fixture cleanup run only before this pair.
  const relations = [...new Set(firstResults.flatMap(getLargeTableRelations))].toSorted()
  // getLargeTableRelations only returns parents from the fixed large-table registry (at most 22).
  if (relations.length > 0) {
    const names = relations.map(relation => `"${relation.replaceAll('"', '""')}"`).join(', ')
    await write(`/* explainSeqScanStability */ ANALYZE ${names}`)
  }

  for (const input of inputs) {
    const result = await capturePlan(input)
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
