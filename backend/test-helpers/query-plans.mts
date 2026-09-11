import { explainAnalyze, type ExplainPlanCacheMode } from '@data-stores/psql'
import type { CapturedTestQuery } from './query-capture.mts'

declare const planStatisticsRefreshBrand: unique symbol

// Branded so `explainCapturedTestQuery` rejects an inline `async () => {}` that satisfies
// `() => Promise<void>` without refreshing stats; only `definePlanStatisticsRefresh()` mints one.
export type PlanStatisticsRefresh = (() => Promise<void>) & {
  readonly [planStatisticsRefreshBrand]: true
}

export function definePlanStatisticsRefresh(refresh: () => Promise<void>): PlanStatisticsRefresh {
  return refresh as PlanStatisticsRefresh
}

export async function explainCapturedTestQuery(
  name: string,
  query: CapturedTestQuery,
  planCacheMode: ExplainPlanCacheMode,
  analyzeTables: PlanStatisticsRefresh,
): Promise<unknown> {
  await analyzeTables()
  return (await explainAnalyze(name, query.text, query.values, { planCacheMode })).plan
}

export function planIndexNames(plan: unknown): string[] {
  return collectPlanNodes(plan)
    .map(node => node['Index Name'])
    .filter((name): name is string => typeof name === 'string')
}

export function collectPlanNodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(collectPlanNodes)
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  return [record, ...Object.values(record).flatMap(collectPlanNodes)]
}
