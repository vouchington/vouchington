import { getResults } from '../run-support.mts'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'
import {
  getCommentDescendantMaxDepth,
  getCommentDescendantReadLimits,
  getCommentLookDownLimits,
} from '@services/comments/placeholder-config'

const HEAD_PAGE_LIMIT = 100

export const COMMENT_DESCENDANT_QUERY_ANNOTATIONS = [
  'getVisibleCommentDescendantIdsPage:heads',
  'getVisibleCommentDescendantIdsPage:frontier',
  'getVisibleCommentDescendantIdsPage:boundary',
] as const

export function getCommentDescendantPlanReadBudget(): {
  heads: number
  frontier: number
  boundary: number
  page: number
} {
  const limits = getCommentDescendantReadLimits()
  const heads = Math.min(HEAD_PAGE_LIMIT, limits.maxHeads) + 2 // page sentinel and authorized root
  const frontier = limits.maxRows
  // At most one boundary per inspected head or raw child, each using the configured look-down cap.
  const boundary = (limits.maxHeads + limits.maxRows) * getCommentLookDownLimits().maxRows
  return { heads, frontier, boundary, page: heads + frontier + boundary }
}

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

export function assertScenarioReadBudget(id: string, maxPageRows: number): void {
  const results = getResults().filter(result => result.scenario_id === id)
  const budget = getCommentDescendantPlanReadBudget()
  const maxQueries = getCommentDescendantMaxDepth() + 1
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
    const headQueries = plans.filter(result =>
      result.name.startsWith(COMMENT_DESCENDANT_QUERY_ANNOTATIONS[0]),
    ).length
    const frontierQueries = plans.filter(result =>
      result.name.startsWith(COMMENT_DESCENDANT_QUERY_ANNOTATIONS[1]),
    ).length
    const boundaryQueries = plans.filter(result =>
      result.name.startsWith(COMMENT_DESCENDANT_QUERY_ANNOTATIONS[2]),
    ).length
    const maxFrontierQueries = getCommentDescendantMaxDepth() - 1
    if (headQueries !== 1 || frontierQueries > maxFrontierQueries || boundaryQueries > 1)
      throw new Error(
        `${id} captured heads/frontier/boundary query counts ${headQueries}/${frontierQueries}/${boundaryQueries} in ${mode}; expected 1/${maxFrontierQueries}/1 at most`,
      )
    let pageRows = 0
    let pageBitmapRows = 0
    for (const result of plans) {
      const annotation = COMMENT_DESCENDANT_QUERY_ANNOTATIONS.find(name =>
        result.name.startsWith(name),
      )
      if (!annotation) throw new Error(`${id} captured unexpected descendant query ${result.name}`)
      const queryBudget = annotation.endsWith(':heads')
        ? budget.heads
        : annotation.endsWith(':frontier')
          ? budget.frontier
          : // The captured boundary fixture must stay within the same per-query row cap.
            Math.min(budget.boundary, budget.frontier)
      const nodes = collectPlanNodes(result.plan)
      const rows = nodes
        .filter(node => baseRelationName(node) === 'posts')
        .reduce((sum, node) => sum + processedRows(node), 0)
      if (rows > queryBudget)
        throw new Error(
          `${id} query ${result.name} processed ${rows} posts in ${mode}; expected at most ${queryBudget}`,
        )
      pageRows += rows
      const bitmapRows = nodes
        .filter(node => node['Node Type'] === 'Bitmap Index Scan')
        .reduce((sum, node) => sum + processedRows(node), 0)
      if (bitmapRows > queryBudget)
        throw new Error(
          `${id} query ${result.name} processed ${bitmapRows} bitmap index rows in ${mode}; expected at most ${queryBudget}`,
        )
      pageBitmapRows += bitmapRows
    }
    const pageBudget = Math.min(maxPageRows, budget.page)
    if (pageRows > pageBudget)
      throw new Error(
        `${id} processed ${pageRows} post rows across ${queryCount} queries in ${mode}; expected at most ${pageBudget}`,
      )
    if (pageBitmapRows > pageBudget)
      throw new Error(
        `${id} processed ${pageBitmapRows} bitmap index rows across ${queryCount} queries in ${mode}; expected at most ${pageBudget}`,
      )
  }
}
