import type { ExplainResult } from '@vouchington/explain-plan'
import { describe, expect, it, vi } from 'vitest'
import { analyzePairedResults } from './analyze-command.mts'
import { assertNoGenericPlanRegressions } from './generic-plan-regressions.mts'

describe('explain analyze paired results', () => {
  it('classifies and displays the same baseline and heavy names', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const results = ['get_heavy_posts', 'get_posts:heavy', 'get_posts:heavy-follow-users'].map(
        name => ({
          name,
          query_text: 'SELECT 1',
          plan: { Plan: { 'Node Type': 'Result' } },
          execution_time_ms: 1,
          planning_time_ms: 1,
          timestamp: new Date().toISOString(),
        }),
      )
      analyzePairedResults('fixture.json', results, results, {})
      const lines = output.mock.calls.flatMap(([text]) => String(text).split('\n'))
      expect(lines).toContain('| get_heavy_posts | baseline | 1.0 | 1.0 | - |')
      expect(lines).toContain('| get_posts | heavy | 1.0 | 1.0 | - |')
      expect(lines).toContain('| get_posts:heavy-follow-users | heavy | 1.0 | 1.0 | - |')
    } finally {
      output.mockRestore()
      diagnostic.mockRestore()
    }
  })

  it('rejects empty result sets', () => {
    expect(() => analyzePairedResults('fixture.json', [], [], {})).toThrow(
      'contains no query results',
    )
  })

  it('rejects disallowed resource pressure', () => {
    const result = {
      name: 'spilling-query',
      query_text: 'SELECT 1',
      plan: { Plan: { 'Node Type': 'Sort', 'Temp Written Blocks': 1 } },
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: new Date().toISOString(),
    }
    expect(() => analyzePairedResults('fixture.json', [result], [result], {})).toThrow(
      'spilling-query',
    )
  })

  it('allows only exact baseline pressure fingerprints', () => {
    const pressureResult = {
      name: 'known-query',
      scenario_id: 'known-scenario',
      capture_index: 0,
      plan_cache_mode: 'auto' as const,
      query_text: 'SELECT 1',
      plan: {
        Plan: { 'Node Type': 'Sort', 'Relation Name': 'posts', 'Temp Written Blocks': 1 },
      },
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: new Date().toISOString(),
    }
    const identity = 'known-scenario|0|known-query|auto'
    expect(() =>
      analyzePairedResults('fixture.json', [pressureResult], [pressureResult], {
        [identity]: ['Sort:posts:temp-written'],
      }),
    ).not.toThrow()
    expect(() =>
      analyzePairedResults('fixture.json', [pressureResult], [pressureResult], {
        [identity]: ['Sort:posts:temp-read'],
      }),
    ).toThrow('temp-written')
  })

  it('rejects WAL pressure only when both captures show it', () => {
    const cold = walResult(11)
    const warm = walResult(1)
    expect(() => analyzePairedResults('fixture.json', [cold], [warm], {})).not.toThrow()
    expect(() => analyzePairedResults('fixture.json', [cold], [cold], {})).toThrow('Sort:-:wal')
  })

  it('rejects WAL pressure when a node fingerprint and the query aggregate trade places', () => {
    const nodePressure = modifyTableWal(11, 5)
    const aggregatePressure = modifyTableWal(9, 5)
    expect(() =>
      analyzePairedResults('fixture.json', [nodePressure], [aggregatePressure], {}),
    ).toThrow('ModifyTable:-:wal')
    expect(() =>
      analyzePairedResults('fixture.json', [aggregatePressure], [nodePressure], {}),
    ).toThrow('query:wal-aggregate')
  })

  it('allows one-capture aggregate WAL and pressure that moves between nodes', () => {
    const aggregate = modifyTableWal(6, 6)
    const calm = modifyTableWal(2, 2)
    expect(() => analyzePairedResults('fixture.json', [aggregate], [calm], {})).not.toThrow()
    expect(() =>
      analyzePairedResults('fixture.json', [walResult(11)], [walResult(11, 'Hash')], {}),
    ).not.toThrow()
  })

  it('still rejects first-capture temp pressure when the repeat is clean', () => {
    const spilling = {
      name: 'spilling-query',
      query_text: 'SELECT 1',
      plan: { Plan: { 'Node Type': 'Sort', 'Temp Written Blocks': 1 } },
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: '2026-11-06T00:00:00.000Z',
    }
    const clean = {
      ...spilling,
      plan: { Plan: { 'Node Type': 'Sort' } },
    }
    expect(() => analyzePairedResults('fixture.json', [spilling], [clean], {})).toThrow(
      'temp-written',
    )
  })

  it('enforces the scoped WAL budget without allowing other pressure', () => {
    const limit = 10 * 1024 * 1024
    const result = {
      name: 'capacity-query',
      scenario_id: 'post-url-capacity-maximum-overcap',
      query_text: 'UPDATE users SET markdown = markdown',
      plan: { Plan: { 'Node Type': 'ModifyTable', 'WAL Bytes': limit - 1 } },
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: new Date().toISOString(),
    }
    const analyze = (candidate: typeof result) =>
      analyzePairedResults('fixture.json', [candidate], [candidate], {})
    expect(() => analyze(JSON.parse(JSON.stringify(result)) as typeof result)).not.toThrow()
    expect(() =>
      analyze({ ...result, plan: { Plan: { 'Node Type': 'ModifyTable', 'WAL Bytes': limit } } }),
    ).toThrow('wal')
    for (const pressure of [
      { 'Temp Read Blocks': 1 },
      { 'Temp Written Blocks': 1 },
      { 'Sort Space Type': 'Disk' },
      { 'Hash Batches': 2 },
    ]) {
      expect(() =>
        analyze({ ...result, plan: { Plan: { ...result.plan.Plan, ...pressure } } }),
      ).toThrow('pressure')
    }
  })
})

function walResult(megabytes: number, nodeType = 'Sort') {
  return {
    name: 'wal-query',
    scenario_id: 'wal-scenario',
    capture_index: 0,
    plan_cache_mode: 'auto' as const,
    query_text: 'UPDATE relation SET deleted_at = now()',
    plan: {
      Plan: { 'Node Type': nodeType, 'WAL Bytes': megabytes * 1024 * 1024 },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-11-06T00:00:00.000Z',
  }
}

function modifyTableWal(exclusiveMegabytes: number, childMegabytes: number) {
  const bytes = 1024 * 1024
  return {
    ...walResult(exclusiveMegabytes, 'ModifyTable'),
    plan: {
      Plan: {
        'Node Type': 'ModifyTable',
        'WAL Bytes': (exclusiveMegabytes + childMegabytes) * bytes,
        Plans: [{ 'Node Type': 'Insert', 'WAL Bytes': childMegabytes * bytes }],
      },
    },
  }
}

describe('generic plan regression gate', () => {
  it('rejects a repeated generic slowdown for the same scenario statement', () => {
    const custom = planResult('force_custom_plan', 23.739)
    const generic = planResult('force_generic_plan', 5803.19)
    const sameSqlDifferentCapture = [
      { ...custom, capture_index: 1, execution_time_ms: 6000 },
      { ...generic, capture_index: 1, execution_time_ms: 6000 },
    ]
    expect(() =>
      assertNoGenericPlanRegressions(
        [custom, generic, ...sameSqlDifferentCapture],
        [
          ...sameSqlDifferentCapture,
          { ...generic, execution_time_ms: 5926.598 },
          { ...custom, execution_time_ms: 23.666 },
        ],
      ),
    ).toThrow(/story-post-related-url-active-relations-maximum.*capture 0.*244\.5x.*250\.4x/)
  })

  it.each([
    { case: 'a one-pass outlier', custom: 25, generic: 600, repeatCustom: 24, repeatGeneric: 25 },
    {
      case: 'a slow cold custom capture',
      custom: 1238,
      generic: 295,
      repeatCustom: 290,
      repeatGeneric: 291,
    },
    {
      case: 'a small absolute increase',
      custom: 0.027,
      generic: 2.454,
      repeatCustom: 0.027,
      repeatGeneric: 2.462,
    },
    {
      case: 'a large increase below the ratio threshold',
      custom: 90,
      generic: 300,
      repeatCustom: 95,
      repeatGeneric: 310,
    },
  ])('allows $case', ({ custom, generic, repeatCustom, repeatGeneric }) => {
    expect(() =>
      assertNoGenericPlanRegressions(
        [planResult('force_custom_plan', custom), planResult('force_generic_plan', generic)],
        [
          planResult('force_custom_plan', repeatCustom),
          planResult('force_generic_plan', repeatGeneric),
        ],
      ),
    ).not.toThrow()
  })

  it('does not compare different scenarios or statements', () => {
    const custom = planResult('force_custom_plan', 10)
    const generic = planResult('force_generic_plan', 1000)
    const results = [
      custom,
      { ...generic, capture_index: 1 },
      { ...generic, scenario_id: 'another-scenario' },
      { ...generic, query_text: 'SELECT 2' },
    ]
    expect(() => assertNoGenericPlanRegressions(results, results)).not.toThrow()
  })
})

function planResult(
  mode: 'force_custom_plan' | 'force_generic_plan',
  executionTimeMs: number,
): ExplainResult {
  return {
    name: `storyPostRelatedUrlProjectionActiveRelationIds:${mode}`,
    scenario_id: 'story-post-related-url-active-relations-maximum',
    capture_index: 0,
    plan_cache_mode: mode,
    query_text: 'SELECT 1',
    plan: { Plan: { 'Node Type': 'Result' } },
    execution_time_ms: executionTimeMs,
    planning_time_ms: 1,
    timestamp: '2026-11-06T00:00:00.000Z',
  }
}
