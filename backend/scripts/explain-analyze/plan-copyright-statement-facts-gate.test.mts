import type { ExplainResult } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { assertCopyrightStatementFactsIsTargetBounded } from './plan-copyright-statement-facts-gate.mts'

const placementLookup = {
  'Node Type': 'Index Scan',
  'Relation Name': 'image_placements',
  'Actual Rows': 1,
  'Actual Loops': 1,
}
const postLookup = {
  'Node Type': 'Index Scan',
  'Relation Name': 'posts__default',
  'Actual Rows': 1,
  'Actual Loops': 1,
}

describe('copyright statement facts plan gate', () => {
  it('accepts correlated placement lookups and a hashed SubPlan over unrelated relations', () => {
    const correlated = result({
      'Node Type': 'Nested Loop',
      Filter: '(((SubPlan 7) IS TRUE) OR ((SubPlan 14) IS TRUE))',
      Plans: [
        {
          'Subplan Name': 'SubPlan 7',
          'Node Type': 'Nested Loop',
          Plans: [placementLookup, postLookup],
        },
        {
          'Subplan Name': 'SubPlan 14',
          'Node Type': 'Hash Join',
          'Join Filter': '(ANY (user_id = (hashed SubPlan 9).col1))',
          Plans: [
            {
              'Subplan Name': 'SubPlan 9',
              'Node Type': 'Seq Scan',
              'Relation Name': 'users',
              'Actual Rows': 40,
              'Actual Loops': 1,
            },
          ],
        },
      ],
    })

    expect(() => assertCopyrightStatementFactsIsTargetBounded(correlated)).not.toThrow()
  })

  it.each(['posts__default', 'image_placements', 'image_surface_placements'])(
    'rejects a hashed SubPlan that reads all of %s',
    relation => {
      const hashedWholeSet = result({
        'Node Type': 'Nested Loop',
        Filter: '(ANY (placement_id = (hashed SubPlan 14).col1))',
        Plans: [
          placementLookup,
          {
            'Subplan Name': 'SubPlan 14',
            'Node Type': 'Nested Loop',
            Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': relation, 'Actual Rows': 3 }],
          },
        ],
      })

      expect(() => assertCopyrightStatementFactsIsTargetBounded(hashedWholeSet)).toThrow(
        `hashed SubPlan 14 reads all of ${relation.replace(/__.*$/, '')}`,
      )
    },
  )

  it('requires the target placement to be evaluated and only a handful of post rows', () => {
    expect(() =>
      assertCopyrightStatementFactsIsTargetBounded(
        result({ ...placementLookup, 'Actual Loops': 0 }),
      ),
    ).toThrow('must evaluate the seeded target')
    expect(() =>
      assertCopyrightStatementFactsIsTargetBounded(
        result({
          'Node Type': 'Nested Loop',
          Plans: [placementLookup, { ...postLookup, 'Actual Rows': 6, 'Actual Loops': 2 }],
        }),
      ),
    ).toThrow('read 12 post rows')
  })

  it('ignores other scenarios', () => {
    expect(() =>
      assertCopyrightStatementFactsIsTargetBounded({
        ...result({ 'Node Type': 'Seq Scan', 'Relation Name': 'posts' }),
        scenario_id: 'post-feed',
      }),
    ).not.toThrow()
  })
})

function result(plan: Record<string, unknown>): ExplainResult {
  return {
    name: 'selectCopyrightStatementFacts:force_custom_plan',
    scenario_id: 'copyright-statement-facts',
    query_text: 'SELECT statement facts',
    plan: { Plan: plan },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}
