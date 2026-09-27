import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertPaginationPlanShape } from './plan-pagination-gates.mts'

function result(scenarioId: string, queryText: string, plan: unknown): ExplainResult {
  const root = (plan as { Plan?: Record<string, unknown> } | null)?.Plan
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    query_text: queryText,
    plan: root ? { ...(plan as object), Plan: { ...root, 'Actual Rows': 1 } } : plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('story post related URL projection EXPLAIN plan', () => {
  it('accepts only presentation sorting after a physically bounded native CTE page', () => {
    expect(() => assertPaginationPlanShape(presentationSortResult(100, 100))).not.toThrow()
  })
  it('rejects native sorting even when its output happens to fit the page', () => {
    const nativeSort = result(
      'story-post-related-url-projection-source-page',
      'SELECT id FROM rss_feed_items',
      {
        Plan: {
          'Node Type': 'Sort',
          'Actual Rows': 100,
          Plans: [
            {
              'Node Type': 'Index Only Scan',
              'Relation Name': 'rss_feed_items',
              'Index Name': 'idx_rss_feed_items__story_id__id__url_id',
              'Actual Rows': 100,
            },
          ],
        },
      },
    )
    expect(() => assertPaginationPlanShape(nativeSort)).toThrow(
      'story-post-related-url-projection-source-page',
    )
  })
  it.each([
    [101, 100],
    [100, 101],
  ])('rejects source or presentation work above the page cap (%i, %i)', (sourceRows, inputRows) => {
    expect(() =>
      assertPaginationPlanShape(presentationSortResult(sourceRows!, inputRows!)),
    ).toThrow('story-post-related-url-projection-source-page')
  })
  it('requires story URL projection pages to use the covering story cursor index', () => {
    const queryText =
      'SELECT rfi.id, rfi.url_id FROM rss_feed_items rfi WHERE rfi.story_id = $1 ORDER BY rfi.id LIMIT $4'
    const indexed = result('story-post-related-url-projection-source-page', queryText, {
      Plan: {
        'Node Type': 'Index Only Scan',
        'Relation Name': 'rss_feed_items',
        'Index Name': 'idx_rss_feed_items__story_id__id__url_id',
      },
    })
    expect(() => assertPaginationPlanShape(indexed)).not.toThrow()

    const partitionIndexed = result('story-post-related-url-projection-source-page', queryText, {
      Plan: {
        'Node Type': 'Index Only Scan',
        'Relation Name': 'rss_feed_items_default',
        'Index Name': 'rss_feed_items_default_story_id_id_url_id_idx',
      },
    })
    expect(() => assertPaginationPlanShape(partitionIndexed)).not.toThrow()

    const scanned = result('story-post-related-url-projection-source-page', queryText, {
      Plan: {
        'Node Type': 'Sort',
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'rss_feed_items' }],
      },
    })
    expect(() => assertPaginationPlanShape(scanned)).toThrow(
      'idx_rss_feed_items__story_id__id__url_id',
    )
  })
})

describe('verified OAuth client listing EXPLAIN plan', () => {
  it('requires the verified active-client index', () => {
    const queryText =
      'SELECT id FROM oauth_clients WHERE metadata_url IS NULL AND revoked_at IS NULL AND verified_at IS NOT NULL ORDER BY id DESC LIMIT $2'
    const indexed = result('oauth-client-verification-verified-page', queryText, {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'oauth_clients',
        'Index Name': 'idx_oauth_clients__verified_active_id',
        'Index Cond': '(id < $1)',
      },
    })
    expect(() => assertPaginationPlanShape(indexed)).not.toThrow()

    const wrongIndex = result('oauth-client-verification-verified-page', queryText, {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'oauth_clients',
        'Index Name': 'oauth_clients_pkey',
        'Index Cond': '(id < $1)',
      },
    })
    expect(() => assertPaginationPlanShape(wrongIndex)).toThrow(
      'idx_oauth_clients__verified_active_id',
    )
  })

  it('requires the continuation cursor to be an index condition', () => {
    const filtered = result(
      'oauth-client-verification-verified-page',
      'SELECT id FROM oauth_clients WHERE id < $1 ORDER BY id DESC LIMIT $2',
      {
        Plan: {
          'Node Type': 'Index Scan',
          'Relation Name': 'oauth_clients',
          'Index Name': 'idx_oauth_clients__verified_active_id',
          Filter: '(id < $1)',
          'Rows Removed by Filter': 1000,
        },
      },
    )
    expect(() => assertPaginationPlanShape(filtered)).toThrow('cursor in its Index Cond')

    const unrelatedIdCondition = result(
      'oauth-client-verification-verified-page',
      'SELECT id FROM oauth_clients WHERE id < $1 ORDER BY id DESC LIMIT $2',
      {
        Plan: {
          'Node Type': 'Index Scan',
          'Relation Name': 'oauth_clients',
          'Index Name': 'idx_oauth_clients__verified_active_id',
          'Index Cond': '(id = owner_user_id)',
          Filter: '(id < $1)',
        },
      },
    )
    expect(() => assertPaginationPlanShape(unrelatedIdCondition)).toThrow(
      'cursor in its Index Cond',
    )
  })

  it('rejects verified client sequential scans', () => {
    const scanned = result(
      'oauth-client-verification-verified-page',
      'SELECT id FROM oauth_clients',
      {
        Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'oauth_clients' },
      },
    )
    expect(() => assertPaginationPlanShape(scanned)).toThrow('oauth_clients sequential scan')
  })

  it('rejects verified client explicit sorts', () => {
    const sorted = result(
      'oauth-client-verification-verified-page',
      'SELECT id FROM oauth_clients',
      {
        Plan: {
          'Node Type': 'Sort',
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'oauth_clients',
              'Index Name': 'idx_oauth_clients__verified_active_id',
              'Index Cond': '(id < $1)',
            },
          ],
        },
      },
    )
    expect(() => assertPaginationPlanShape(sorted)).toThrow('explicit Sort')
  })
})

function presentationSortResult(sourceRows: number, inputRows: number): ExplainResult {
  return result('story-post-related-url-projection-source-page', 'SELECT id FROM rss_feed_items', {
    Plan: {
      'Node Type': 'Sort',
      'Actual Rows': inputRows,
      Plans: [
        {
          'Node Type': 'Limit',
          'Parent Relationship': 'InitPlan',
          'Subplan Name': 'CTE items',
          'Actual Rows': Math.min(sourceRows, 100),
          Plans: [
            {
              'Node Type': 'Index Only Scan',
              'Relation Name': 'rss_feed_items',
              'Index Name': 'idx_rss_feed_items__story_id__id__url_id',
              'Actual Rows': sourceRows,
            },
          ],
        },
        { 'Node Type': 'CTE Scan', 'CTE Name': 'items', 'Actual Rows': inputRows },
      ],
    },
  })
}
