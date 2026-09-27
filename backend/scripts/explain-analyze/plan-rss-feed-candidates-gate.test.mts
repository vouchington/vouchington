import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertRssFeedCandidatesAreSetBased } from './plan-rss-feed-candidates-gate.mts'

function result(plan: unknown, scenario_id = 'rss-feed-item-feed-heavy-follows'): ExplainResult {
  return {
    name: scenario_id,
    scenario_id,
    query_text:
      'WITH direct_candidate_rss_feed_items AS MATERIALIZED (SELECT 1) SELECT DISTINCT ON (candidate.story_id) candidate.* FROM direct_candidate_rss_feed_items candidate',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('assertRssFeedCandidatesAreSetBased', () => {
  it('accepts ordinary and heavy membership work within the seeded source budget', () => {
    for (const scenario of ['rss-feed-item-feed', 'rss-feed-item-feed-heavy-follows']) {
      expect(() =>
        assertRssFeedCandidatesAreSetBased(
          result(
            {
              Plan: {
                'Node Type': 'Hash Join',
                'Shared Hit Blocks': 999_999,
                Plans: [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'rss_feed_item_sources',
                    'Actual Rows': 65_000,
                    'Actual Loops': 1,
                  },
                  {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'rss_feed_items_default',
                    'Actual Rows': 1,
                    'Actual Loops': 10_000,
                  },
                ],
              },
            },
            scenario,
          ),
        ),
      ).not.toThrow()
    }
  })
  it('rejects repeated source scans even when each scan returns few rows', () => {
    expect(() =>
      assertRssFeedCandidatesAreSetBased(
        result({
          Plan: {
            'Node Type': 'Bitmap Heap Scan',
            'Relation Name': 'rss_feed_item_sources',
            'Actual Rows': 2.17,
            'Actual Loops': 120_725,
          },
        }),
      ),
    ).toThrow('processed 261973.25 rss_feed_item_sources rows')
  })
  it('rejects repeated story sibling evaluation', () => {
    expect(() =>
      assertRssFeedCandidatesAreSetBased(
        result({
          Plan: {
            'Node Type': 'Index Scan',
            'Relation Name': 'rss_feed_items_default',
            Alias: 'better_rss_feed_item',
            'Actual Rows': 2.09,
            'Rows Removed by Filter': 10,
            'Actual Loops': 9775,
          },
        }),
      ),
    ).toThrow('rss_feed_items rows')
    expect(() =>
      assertRssFeedCandidatesAreSetBased(
        result({
          Plan: {
            'Node Type': 'Index Scan',
            'Relation Name': 'rss_feed_items__p_current',
            Alias: 'better_rss_feed_item',
            'Actual Rows': 0,
            'Actual Loops': 1,
          },
        }),
      ),
    ).toThrow('select story winners once')
  })
  it('counts filtered and rechecked source rows against the work budget', () => {
    expect(() =>
      assertRssFeedCandidatesAreSetBased(
        result({
          Plan: {
            'Node Type': 'Bitmap Heap Scan',
            'Relation Name': 'rss_feed_item_sources',
            'Actual Rows': 1,
            'Rows Removed by Filter': 1,
            'Rows Removed by Index Recheck': 1,
            'Actual Loops': 100_000,
          },
        }),
      ),
    ).toThrow('processed 300000 rss_feed_item_sources rows')
    expect(() =>
      assertRssFeedCandidatesAreSetBased(
        result({
          Plan: {
            'Node Type': 'Nested Loop',
            'Actual Loops': 100_000,
            'Rows Removed by Join Filter': 3,
          },
        }),
      ),
    ).toThrow('rejected 300000 join rows')
  })
  it('ignores RSS search and unrelated scenarios', () => {
    expect(() =>
      assertRssFeedCandidatesAreSetBased(result({}, 'rss-feed-items-search')),
    ).not.toThrow()
  })
})
