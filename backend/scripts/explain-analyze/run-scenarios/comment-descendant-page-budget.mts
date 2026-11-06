import { getResults } from '../run-support.mts'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'

export function assertPageSize(
  page: { results: readonly string[] },
  max: number,
  label: string,
): void {
  if (page.results.length > max)
    throw new Error(`${label} returned ${page.results.length} rows; expected at most ${max}`)
}

export function assertExactIds(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const actualIds = [...actual].toSorted()
  const expectedIds = [...expected].toSorted()
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
    throw new Error(`${label} returned a different set of comment ids than its fixture`)
}

export function assertScenarioReadBudget(id: string, maxRows: number, maxQueries: number): void {
  const results = getResults().filter(result => result.scenario_id === id)
  const modes = new Map<string, typeof results>()
  for (const result of results) {
    const mode = result.plan_cache_mode ?? 'auto'
    modes.set(mode, [...(modes.get(mode) ?? []), result])
  }
  if (modes.size === 0) throw new Error(`${id} captured no service plans to budget`)
  for (const [mode, plans] of modes) {
    const queryCount = new Set(plans.map(result => result.capture_index)).size
    if (queryCount > maxQueries)
      throw new Error(
        `${id} submitted ${queryCount} service queries in ${mode}; expected at most ${maxQueries}`,
      )
    const rows = plans.reduce(
      (sum, result) =>
        sum +
        collectPlanNodes(result.plan)
          .filter(node => baseRelationName(node) === 'posts')
          .reduce((queryRows, node) => queryRows + processedRows(node), 0),
      0,
    )
    if (rows > maxRows)
      throw new Error(
        `${id} processed ${rows} post rows across ${queryCount} queries in ${mode}; expected at most ${maxRows}`,
      )
    const bitmapRows = plans.reduce(
      (sum, result) =>
        sum +
        collectPlanNodes(result.plan)
          .filter(node => node['Node Type'] === 'Bitmap Index Scan')
          .reduce((queryRows, node) => queryRows + processedRows(node), 0),
      0,
    )
    if (bitmapRows > maxRows)
      throw new Error(
        `${id} processed ${bitmapRows} bitmap index rows across ${queryCount} queries in ${mode}; expected at most ${maxRows}`,
      )
  }
}
