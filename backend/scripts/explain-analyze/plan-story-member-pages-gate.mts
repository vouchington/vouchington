import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'

const PAGE_SHAPES = new Map<string, { limit: number; after: boolean; excluded: boolean }>()
for (const [kind, limit, excluded] of [
  ['preview-1', 1, true],
  ['preview-3', 3, true],
  ['detail-25', 25, false],
] as const) {
  for (const phase of ['first', 'after'] as const) {
    PAGE_SHAPES.set(`story-members-${kind}-${phase}`, {
      limit,
      after: phase === 'after',
      excluded: excluded && phase === 'first',
    })
  }
}

const HYDRATION_QUERY_NAMES = new Set([
  'getRssFeedItemsByIdBatch',
  'getElectionsByIdBatch',
  'getRssFeedItemEmbedsByItems',
])

export function assertStoryMemberPagePlan(result: ExplainResult): void {
  const scenario = result.scenario_id
  const shape = scenario ? PAGE_SHAPES.get(scenario) : undefined
  if (shape) {
    assertSelectorPlan(result, shape)
    return
  }
  if (!scenario?.startsWith('story-hydration-')) return
  const membership = PAGE_SHAPES.get(scenario.replace('story-hydration-', 'story-members-'))
  if (!membership) throw new Error(`${result.name} has an unknown story hydration scenario`)
  assertHydrationPlan(result, membership.limit)
}

function assertSelectorPlan(
  result: ExplainResult,
  { limit, after, excluded }: { limit: number; after: boolean; excluded: boolean },
): void {
  if (!result.name.startsWith('getStoryMemberPagesBatch:'))
    throw new Error(`${result.name} must capture the production story member selector`)
  const nodes = collectPlanNodes(result.plan)
  const membershipScans = nodes.filter(node =>
    String(node['Relation Name'] ?? '').startsWith('rss_feed_items'),
  )
  const executing = membershipScans.filter(node => Number(node['Actual Loops'] ?? 0) > 0)
  if (executing.length !== 1)
    throw new Error(`${result.name} must execute one indexed story membership scan`)
  const scan = executing[0]!
  const condition = String(scan['Index Cond'] ?? '')
  if (
    !['Index Scan', 'Index Only Scan'].includes(String(scan['Node Type'])) ||
    !condition.includes('story_id =') ||
    (after && !hasStoryMembershipContinuationBound(condition)) ||
    Number(scan['Actual Loops']) !== 1
  )
    throw new Error(`${result.name} must use one story_id index probe${after ? ' with id <' : ''}`)
  const work = physicalRows(scan)
  const ceiling = limit + 1 + Number(excluded)
  if (work > ceiling)
    throw new Error(`${result.name} scanned ${work} story members for a ${ceiling}-row budget`)
  const lookahead = nodes.some(
    node =>
      node['Node Type'] === 'Limit' &&
      Number(node['Actual Rows']) * Number(node['Actual Loops']) === limit + 1,
  )
  if (!lookahead || rootRows(result.plan) !== limit + 1)
    throw new Error(`${result.name} must exercise a full ${limit + 1}-row lookahead page`)
}

function assertHydrationPlan(result: ExplainResult, limit: number): void {
  const name = result.name.split(':', 1)[0]!
  if (!HYDRATION_QUERY_NAMES.has(name))
    throw new Error(`${result.name} must capture a selected-ID story hydration query`)
  const rows = rootRows(result.plan)
  if (rows < 1 || rows > limit)
    throw new Error(`${result.name} hydrated ${rows} rows for a ${limit}-item page`)
  const broadItems = collectPlanNodes(result.plan).filter(
    node =>
      String(node['Relation Name'] ?? '').startsWith('rss_feed_items') &&
      node['Node Type'] === 'Seq Scan' &&
      Number(node['Actual Loops'] ?? 0) > 0,
  )
  if (broadItems.length)
    throw new Error(`${result.name} must not sequentially scan RSS items to hydrate a page`)
}

function hasStoryMembershipContinuationBound(indexCondition: string): boolean {
  return (
    indexCondition.includes('id <') ||
    indexCondition.includes('ROW(story_id, id) <') ||
    indexCondition.includes('(story_id, id) <')
  )
}

function physicalRows(node: Record<string, unknown>): number {
  return (
    (Number(node['Actual Rows'] ?? 0) +
      Number(node['Rows Removed by Filter'] ?? 0) +
      Number(node['Rows Removed by Index Recheck'] ?? 0)) *
    Number(node['Actual Loops'] ?? 0)
  )
}

function rootRows(plan: unknown): number {
  const root = (plan as { Plan?: { 'Actual Rows'?: number } } | null)?.Plan
  return Number(root?.['Actual Rows'] ?? 0)
}
