import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertPaginationPlanShape } from './plan-pagination-gates.mts'

function result(scan: Record<string, unknown>): ExplainResult {
  return {
    name: 'rss-feed-items-search-global-late-cursor',
    scenario_id: 'rss-feed-items-search-global-late-cursor',
    query_text: 'SELECT id FROM rss_feed_items',
    plan: { Plan: scan },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}
const indexed = {
  'Node Type': 'Index Scan',
  'Relation Name': 'rss_feed_items_default',
  'Index Name': 'rss_feed_items_default_published_at_id_idx',
  'Index Cond': '(ROW(published_at, id) < ROW($1, $2))',
  'Actual Rows': 26,
  'Actual Loops': 1,
}

describe('RSS late recency cursor gate', () => {
  it('accepts an indexed cursor bound within the candidate ceiling', () => {
    expect(() => assertPaginationPlanShape(result(indexed))).not.toThrow()
    expect(() =>
      assertPaginationPlanShape(
        result({ ...indexed, 'Index Name': 'idx_rss_feed_items__published_at__id' }),
      ),
    ).not.toThrow()
  })
  it.each([
    { 'Index Cond': undefined, Filter: indexed['Index Cond'] },
    { 'Actual Rows': 27 },
    { 'Rows Removed by Filter': 1 },
    { 'Rows Removed by Index Recheck': 1 },
    { 'Actual Rows': 14, 'Actual Loops': 2 },
    { 'Node Type': 'Seq Scan' },
    { 'Index Cond': '(published_at < $1)' },
  ])('rejects an unbounded cursor or excess physical source work %j', override => {
    expect(() => assertPaginationPlanShape(result({ ...indexed, ...override }))).toThrow(
      /index bound/,
    )
  })
  it('counts independent physical scans without double counting parent rows', () => {
    const physical = { ...indexed, 'Actual Rows': 13 }
    expect(() =>
      assertPaginationPlanShape(
        result({ 'Node Type': 'Append', 'Actual Rows': 26, Plans: [physical, physical] }),
      ),
    ).not.toThrow()
    expect(() =>
      assertPaginationPlanShape(
        result({ 'Node Type': 'Append', Plans: [physical, { ...physical, 'Actual Rows': 14 }] }),
      ),
    ).toThrow(/observed 27/)
  })
})
