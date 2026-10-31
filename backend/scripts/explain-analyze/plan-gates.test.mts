import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'

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

async function loadGates() {
  vi.resetModules()
  const gates = await import('./plan-gates.mts')
  const expectations = await import('./plan-expectations.mts')
  return { ...gates, ...expectations }
}

describe('plan expectation registry', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('rejects unknown scenario ids and expectation kinds', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
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

  it('rejects a registered scenario without any captured result', async () => {
    const { registerScenarioContract, assertPlanRegistry } = await loadGates()
    registerScenarioContract('post-search-new', { expectations: [] })
    expect(() => assertPlanRegistry(['post-search-hot'])).toThrow('has no captured result')
    expect(() => assertPlanRegistry(['post-search-new'])).not.toThrow()
  })

  it('evaluates query binding, index and processed-row limits from one registry entry', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
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

  it('budgets bitmap index entries even when the heap returns one row', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
    registerScenarioContract('topic-viewer-counts-dense', {
      expectations: [{ kind: 'maxBitmapIndexRows', max: 1_000 }],
    })
    const plan = result('topic-viewer-counts-dense', {
      'Node Type': 'Bitmap Heap Scan',
      'Relation Name': 'relation__post__category__topic__default',
      'Actual Rows': 1,
      'Actual Loops': 1,
      Plans: [
        {
          'Node Type': 'Bitmap Index Scan',
          'Index Name': 'global_positive_score_index',
          'Actual Rows': 20_000,
          'Actual Loops': 1,
        },
      ],
    })

    expect(() => assertRequiredPlanShape(plan)).toThrow('processed 20000 bitmap index entries')
  })

  it('accepts any one of equivalent indexes when anyOf is set', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
    registerScenarioContract('post-metrics-batch', {
      expectations: [{ kind: 'usesIndexes', indexes: ['posts_a_idx', 'posts_b_idx'], anyOf: true }],
    })
    const scan = (index: string) => ({
      'Node Type': 'Index Scan',
      'Relation Name': 'posts__default',
      'Index Name': index,
      'Actual Rows': 1,
      'Actual Loops': 1,
    })
    expect(() =>
      assertRequiredPlanShape(result('post-metrics-batch', scan('posts_b_idx'))),
    ).not.toThrow()
    expect(() => assertRequiredPlanShape(result('post-metrics-batch', scan('other')))).toThrow(
      'one of index(es) posts_a_idx, posts_b_idx',
    )
  })

  it('fails an executing unpruned parent and passes when only one leaf executes', async () => {
    const { assertRequiredPlanShape } = await loadGates()
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

  it('accepts an explicit cross-partition reason for intentional fanout', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
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

  it('matches nested partition parents by their longest name', async () => {
    const { assertRequiredPlanShape } = await loadGates()
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

  it('rejects sequential scans only above the declared seeded-row threshold', async () => {
    const scan = result('post-search-new', {
      'Node Type': 'Seq Scan',
      'Relation Name': 'posts__default',
      'Actual Rows': 1,
      'Actual Loops': 1,
    })
    const above = await loadGates()
    above.registerScenarioContract('post-search-new', {
      expectations: [],
      seededRows: { posts: 150_000 + 1 },
    })
    expect(() => above.assertRequiredPlanShape(scan)).toThrow('sequentially scanned posts')

    const atThreshold = await loadGates()
    atThreshold.registerScenarioContract('post-search-new', {
      expectations: [],
      seededRows: { posts: 150_000 },
    })
    expect(() => atThreshold.assertRequiredPlanShape(scan)).not.toThrow()
  })

  it('requires a seeded-row declaration for a nonempty unbounded sequential scan', async () => {
    const { assertRequiredPlanShape } = await loadGates()
    const scan = result('post-search-new', {
      'Node Type': 'Seq Scan',
      'Relation Name': 'web_push_endpoint_owners',
      'Actual Rows': 1,
      'Actual Loops': 1,
    })
    expect(() => assertRequiredPlanShape(scan)).toThrow('without a declared seeded row count')
    const empty = result('post-search-new', {
      'Node Type': 'Seq Scan',
      'Relation Name': 'web_push_endpoint_owners',
      'Actual Rows': 0,
      'Actual Loops': 1,
    })
    expect(() => assertRequiredPlanShape(empty)).not.toThrow()
  })

  it('caps actual function calls and rejects a cap no captured query exercises', async () => {
    const { registerScenarioContract, assertRequiredPlanShape, assertScenarioFunctionCalls } =
      await loadGates()
    registerScenarioContract('post-search-new', {
      expectations: [{ kind: 'maxFunctionCalls', function: 'fn_image_policy', max: 2 }],
    })
    const captured = result('post-search-new', { 'Node Type': 'Result' })
    captured.function_calls = [
      { funcname: 'fn_image_policy', calls: 2, total_time: 1, self_time: 1 },
    ]
    expect(() => assertRequiredPlanShape(captured)).not.toThrow()
    expect(() => assertScenarioFunctionCalls('post-search-new', [captured])).not.toThrow()
    captured.function_calls[0]!.calls = 3
    expect(() => assertRequiredPlanShape(captured)).toThrow('called fn_image_policy 3 times')
    captured.function_calls = []
    expect(() => assertScenarioFunctionCalls('post-search-new', [captured])).toThrow(
      'never called capped function fn_image_policy',
    )
  })

  it('rejects a function-call cap when launched parallel workers make leader counts incomplete', async () => {
    const { registerScenarioContract, assertRequiredPlanShape } = await loadGates()
    registerScenarioContract('post-search-new', {
      expectations: [{ kind: 'maxFunctionCalls', function: 'fn_image_policy', max: 2 }],
    })
    const captured = result('post-search-new', {
      'Node Type': 'Gather',
      'Workers Launched': 2,
      Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts' }],
    })
    captured.function_calls = [
      { funcname: 'fn_image_policy', calls: 1, total_time: 1, self_time: 1 },
    ]
    expect(() => assertRequiredPlanShape(captured)).toThrow('parallel workers')

    captured.function_calls_serial = true
    expect(() => assertRequiredPlanShape(captured)).not.toThrow()
    captured.function_calls_serial = false

    captured.plan = result('post-search-new', {
      'Node Type': 'Gather',
      'Workers Launched': 0,
      Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts' }],
    }).plan
    expect(() => assertRequiredPlanShape(captured)).not.toThrow()
  })
})
