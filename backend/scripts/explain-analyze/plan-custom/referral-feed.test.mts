import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertReferralFeedInspectedWalk } from './referral-feed.mts'

function result(
  changes: Record<string, unknown> = {},
  scenario = 'referral-feed-inspected-empty',
): ExplainResult {
  return {
    name: 'getReferralLinksFeed',
    scenario_id: scenario,
    query_text: 'SELECT id FROM user_referral_program_links',
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    plan: {
      Plan: {
        'Node Type': 'Limit',
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'user_referral_program_links',
            Alias: 'urpl',
            'Index Name': 'user_referral_program_links_pkey',
            'Scan Direction': 'Backward',
            'Actual Rows': 10,
            'Actual Loops': 1,
            'Index Cond': '(id < $1)',
            ...changes,
          },
        ],
      },
    },
  }
}

describe('referral inspected-walk plan contract', () => {
  it('accepts the strict limit, empty tail, and a keyed latest-link side probe', () => {
    expect(() => assertReferralFeedInspectedWalk(result())).not.toThrow()
    expect(() => assertReferralFeedInspectedWalk(result({ 'Actual Rows': 0 }))).not.toThrow()
    expect(() =>
      assertReferralFeedInspectedWalk(
        result({
          Plans: [
            {
              'Node Type': 'Sort',
              Plans: [
                {
                  'Node Type': 'Index Scan',
                  'Relation Name': 'user_referral_program_links',
                  Alias: 'urpl2',
                  'Actual Rows': 1,
                  'Actual Loops': 1,
                },
              ],
            },
          ],
        }),
      ),
    ).not.toThrow()
    expect(() =>
      assertReferralFeedInspectedWalk(
        result({ 'Actual Rows': 1000 }, 'referral-feed-inspected-limit100'),
      ),
    ).not.toThrow()
  })

  it.each([
    { 'Actual Rows': 11 },
    { 'Actual Rows': 5, 'Rows Removed by Filter': 6 },
    { 'Actual Rows': 5, 'Rows Removed by Index Recheck': 6 },
    { 'Actual Loops': 2 },
    { 'Index Name': 'wrong_index' },
    { 'Scan Direction': 'Forward' },
  ])('rejects excess work or an unordered driver: %j', change => {
    expect(() => assertReferralFeedInspectedWalk(result(change))).toThrow('raw referral IDs')
  })

  it('rejects a sort above the driver and a continuation outside the index condition', () => {
    const sorted = result()
    const root = sorted.plan as { Plan: Record<string, unknown> }
    root.Plan = { 'Node Type': 'Sort', Plans: [root.Plan] }
    expect(() => assertReferralFeedInspectedWalk(sorted)).toThrow('without sorting')
    expect(() => assertReferralFeedInspectedWalk(result({ 'Index Cond': undefined }))).toThrow(
      'Index Cond',
    )
  })
})
