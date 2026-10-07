import { afterEach, describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertRequiredPlanShape, SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD } from './plan-gates.mts'
import {
  assertPlanRegistry,
  registerScenarioContract,
  resetScenarioContracts,
} from './plan-expectations.mts'

function result(
  scenarioId: string,
  node: Record<string, unknown>,
  query = 'SELECT id FROM posts',
): ExplainResult {
  return {
    name: 'capturedQuery',
    scenario_id: scenarioId,
    query_text: query,
    plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1, 'Actual Loops': 1, Plans: [node] } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

describe('plan expectation registry', () => {
  afterEach(resetScenarioContracts)
  it('rejects unknown scenario ids and expectation kinds', () => {
    expect(() => registerScenarioContract('invented', { expectations: [] })).toThrow(
      'Unknown EXPLAIN scenario',
    )
    expect(() =>
      registerScenarioContract('post-search-new', {
        expectations: [{ kind: 'invented' } as never],
      }),
    ).toThrow('Unknown plan expectation kind')
    expect(() => assertRequiredPlanShape(result('invented', { 'Node Type': 'Result' }))).toThrow(
      'Unknown EXPLAIN scenario',
    )
  })

  it('rejects a registered scenario without any captured result', () => {
    registerScenarioContract('post-search-new', { expectations: [] })
    expect(() => assertPlanRegistry(['post-search-hot'])).toThrow('has no captured result')
    expect(() => assertPlanRegistry(['post-search-new'])).not.toThrow()
  })

  it('evaluates query binding, index and processed-row limits from one registry entry', () => {
    registerScenarioContract('post-metrics-batch', {
      expectations: [
        { kind: 'queryBinds', token: 'requested_posts' },
        { kind: 'usesIndexes', indexes: ['posts_pkey'] },
        { kind: 'maxProcessedRows', relation: 'posts', max: 3 },
        { kind: 'forbidCorrelatedAggregates' },
      ],
    })
    const scan = {
      'Node Type': 'Index Scan',
      'Relation Name': 'posts__default',
      'Index Name': 'posts_pkey',
      'Actual Rows': 1,
      'Rows Removed by Filter': 1,
      'Actual Loops': 1,
    }
    const good = result(
      'post-metrics-batch',
      scan,
      'WITH requested_posts AS (SELECT id FROM posts) SELECT id FROM requested_posts',
    )
    expect(() => assertRequiredPlanShape(good)).not.toThrow()
    expect(() =>
      assertRequiredPlanShape(
        result('post-metrics-batch', { ...scan, 'Rows Removed by Filter': 3 }, good.query_text),
      ),
    ).toThrow('processed 4 rows')
    expect(() =>
      assertRequiredPlanShape(result('post-metrics-batch', scan, 'SELECT id FROM posts')),
    ).toThrow('requested_posts')
    expect(() =>
      assertRequiredPlanShape(
        result('post-metrics-batch', { ...scan, 'Index Name': 'other' }, good.query_text),
      ),
    ).toThrow('posts_pkey')
  })

  it('fails an executing unpruned parent and passes when only one leaf executes', () => {
    const scans = [
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'posts__default',
        'Actual Rows': 1,
        'Actual Loops': 1,
      },
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'posts__p_later',
        'Actual Rows': 1,
        'Actual Loops': 1,
      },
    ]
    const unpruned = result('post-search-new', { 'Node Type': 'Append', Plans: scans })
    expect(() => assertRequiredPlanShape(unpruned)).toThrow('without crossPartition reason')
    scans[1]!['Actual Loops'] = 0
    expect(() => assertRequiredPlanShape(unpruned)).not.toThrow()
  })

  it('accepts an explicit cross-partition reason for intentional fanout', () => {
    registerScenarioContract('post-search-new', {
      expectations: [],
      crossPartition: { posts: 'This fixture deliberately reads adjacent date windows.' },
    })
    const unpruned = result('post-search-new', {
      'Node Type': 'Append',
      Plans: [
        {
          'Node Type': 'Index Scan',
          'Relation Name': 'posts__default',
          'Actual Rows': 1,
          'Actual Loops': 1,
        },
        {
          'Node Type': 'Index Scan',
          'Relation Name': 'posts__p_later',
          'Actual Rows': 1,
          'Actual Loops': 1,
        },
      ],
    })
    expect(() => assertRequiredPlanShape(unpruned)).not.toThrow()
  })

  it('matches nested partition parents by their longest name', () => {
    const scan = result('post-search-new', {
      'Node Type': 'Append',
      Plans: [
        {
          'Node Type': 'Index Scan',
          'Relation Name': 'relation__post__category__topic__votes__default',
          'Actual Rows': 1,
          'Actual Loops': 1,
        },
        {
          'Node Type': 'Index Scan',
          'Relation Name': 'relation__post__category__topic__votes__p_later',
          'Actual Rows': 1,
          'Actual Loops': 1,
        },
      ],
    })
    expect(() => assertRequiredPlanShape(scan)).toThrow('relation__post__category__topic__votes')
  })

  it('rejects sequential scans only above the declared seeded-row threshold', () => {
    const scan = result('post-search-new', {
      'Node Type': 'Seq Scan',
      'Relation Name': 'posts__default',
      'Actual Rows': 1,
      'Actual Loops': 1,
    })
    registerScenarioContract('post-search-new', {
      expectations: [],
      seededRows: { posts: SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD + 1 },
    })
    expect(() => assertRequiredPlanShape(scan)).toThrow('sequentially scanned posts')
    resetScenarioContracts()
    registerScenarioContract('post-search-new', {
      expectations: [],
      seededRows: { posts: SEQUENTIAL_SCAN_SEEDED_ROW_THRESHOLD },
    })
    expect(() => assertRequiredPlanShape(scan)).not.toThrow()
  })

  it('requires a seeded-row declaration for a nonempty unbounded sequential scan', () => {
    const scan = result('post-search-new', {
      'Node Type': 'Seq Scan',
      'Relation Name': 'admin_import_rows',
      'Actual Rows': 1,
      'Actual Loops': 1,
    })
    expect(() => assertRequiredPlanShape(scan)).toThrow('without a declared seeded row count')
    const empty = result('post-search-new', {
      'Node Type': 'Seq Scan',
      'Relation Name': 'admin_import_rows',
      'Actual Rows': 0,
      'Actual Loops': 1,
    })
    expect(() => assertRequiredPlanShape(empty)).not.toThrow()
  })
})
