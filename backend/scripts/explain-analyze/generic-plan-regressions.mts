import type { ExplainResult } from '@data-stores/psql'

const GENERIC_PLAN_MAX_RATIO = 10
const GENERIC_PLAN_MIN_ADDED_EXECUTION_MS = 200

type PlanComparison = { custom: ExplainResult; generic: ExplainResult }

function genericPlanSlowdowns(results: readonly ExplainResult[]): Map<string, PlanComparison> {
  const compared = results.filter(
    result =>
      result.scenario_id !== undefined &&
      result.capture_index !== undefined &&
      (result.plan_cache_mode === 'force_custom_plan' ||
        result.plan_cache_mode === 'force_generic_plan'),
  )
  // The capture ordinal identifies the bound inputs even when a scenario repeats identical SQL.
  const pairs = Map.groupBy(compared, result =>
    JSON.stringify([
      result.scenario_id,
      result.capture_index,
      result.name.replace(/:force_(custom|generic)_plan$/, ''),
      result.query_text,
      result.jit_mode,
    ]),
  )

  const slowdowns = new Map<string, PlanComparison>()
  for (const [identity, captures] of pairs) {
    if (captures.length === 1) continue
    const custom = captures.find(result => result.plan_cache_mode === 'force_custom_plan')
    const generic = captures.find(result => result.plan_cache_mode === 'force_generic_plan')
    if (captures.length !== 2 || !custom || !generic)
      throw new Error(`Ambiguous custom/generic EXPLAIN pair for ${captures[0]?.name ?? identity}`)

    const customMs = custom.execution_time_ms
    const genericMs = generic.execution_time_ms
    if (
      genericMs > customMs * GENERIC_PLAN_MAX_RATIO &&
      genericMs - customMs > GENERIC_PLAN_MIN_ADDED_EXECUTION_MS
    ) {
      slowdowns.set(identity, { custom, generic })
    }
  }
  return slowdowns
}

function formatSlowdown({ custom, generic }: PlanComparison): string {
  const customMs = custom.execution_time_ms
  const genericMs = generic.execution_time_ms
  return `${customMs.toFixed(3)}ms custom → ${genericMs.toFixed(3)}ms generic (${(genericMs / customMs).toFixed(1)}x)`
}

export function assertNoGenericPlanRegressions(
  results: readonly ExplainResult[],
  repeatedResults: readonly ExplainResult[],
): void {
  const first = genericPlanSlowdowns(results)
  const repeated = genericPlanSlowdowns(repeatedResults)
  const regressions: string[] = []
  for (const [identity, firstSlowdown] of first) {
    const repeatedSlowdown = repeated.get(identity)
    if (repeatedSlowdown === undefined) continue
    const { scenario_id, capture_index, name } = firstSlowdown.generic
    regressions.push(
      `${String(scenario_id)} capture ${String(capture_index)} (${name}): first ${formatSlowdown(firstSlowdown)}, repeat ${formatSlowdown(repeatedSlowdown)}`,
    )
  }
  if (regressions.length > 0)
    throw new Error(`EXPLAIN found repeated generic plan slowdowns: ${regressions.join('; ')}`)
}
