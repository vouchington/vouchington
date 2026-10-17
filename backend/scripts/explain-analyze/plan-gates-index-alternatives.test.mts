import { afterEach, describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertRequiredPlanShape } from './plan-gates.mts'
import { registerScenarioContract, resetScenarioContracts } from './plan-expectations.mts'

const authorIndexes = [
  'posts__default_created_by_id_idx',
  'posts__default_created_by_id_is_anonymous_idx',
] as const

function result(
  node: Record<string, unknown>,
  query = 'SELECT ... GROUP BY metric_scope',
): ExplainResult {
  return {
    name: 'userProfileFacets',
    scenario_id: 'user-profile-metrics',
    query_text: query,
    plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1, Plans: [node] } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

describe('alternative plan index expectations', () => {
  afterEach(resetScenarioContracts)

  it('accepts each named author index and rejects unrelated or sequential access', () => {
    registerScenarioContract('user-profile-metrics', {
      expectations: [
        {
          kind: 'usesAnyIndex',
          indexes: authorIndexes,
          queryContains: 'GROUP BY metric_scope',
          noSort: true,
        },
      ],
    })

    for (const index of authorIndexes) {
      expect(() =>
        assertRequiredPlanShape(
          result({
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            'Index Name': index,
            'Actual Rows': 1,
          }),
        ),
      ).not.toThrow()
    }

    expect(() =>
      assertRequiredPlanShape(
        result({
          'Node Type': 'Index Scan',
          'Relation Name': 'posts__default',
          'Index Name': 'posts__default_id_idx4',
          'Actual Rows': 1,
        }),
      ),
    ).toThrow('must use one of index(es)')
    expect(() =>
      assertRequiredPlanShape(
        result({ 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default', 'Actual Rows': 1 }),
      ),
    ).toThrow('must use one of index(es)')
  })

  it('retains query scoping and the no-sort option', () => {
    registerScenarioContract('user-profile-metrics', {
      expectations: [
        {
          kind: 'usesAnyIndex',
          indexes: authorIndexes,
          queryContains: 'GROUP BY metric_scope',
          noSort: true,
        },
      ],
    })
    expect(() =>
      assertRequiredPlanShape(
        result({ 'Node Type': 'Result', 'Actual Rows': 1 }, 'SELECT ... WHERE id = 1'),
      ),
    ).not.toThrow()
    expect(() =>
      assertRequiredPlanShape(
        result({
          'Node Type': 'Sort',
          'Actual Rows': 1,
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'posts__default',
              'Index Name': authorIndexes[0],
              'Actual Rows': 1,
            },
          ],
        }),
      ),
    ).toThrow('without an explicit Sort')
  })

  it('keeps usesIndexes all-of semantics and rejects empty index lists', () => {
    registerScenarioContract('post-search-new', {
      expectations: [{ kind: 'usesIndexes', indexes: authorIndexes }],
    })
    const oneAuthorIndex: ExplainResult = {
      ...result({
        'Node Type': 'Index Scan',
        'Relation Name': 'posts__default',
        'Index Name': authorIndexes[0],
        'Actual Rows': 1,
      }),
      scenario_id: 'post-search-new',
    }
    expect(() => assertRequiredPlanShape(oneAuthorIndex)).toThrow('must use index(es)')

    resetScenarioContracts()
    for (const expectation of [
      { kind: 'usesAnyIndex', indexes: [] },
      { kind: 'usesAnyIndex', indexes: [' '] },
      { kind: 'usesIndexes', indexes: [' '] },
    ] as const) {
      expect(() =>
        registerScenarioContract('post-search-new', {
          expectations: [expectation],
        }),
      ).toThrow('needs at least one nonempty index name')
    }
  })
})
