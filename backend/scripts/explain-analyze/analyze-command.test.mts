import { describe, expect, it, vi } from 'vitest'
import { analyzePairedResults } from './analyze-command.mts'

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
      const lines = output.mock.calls.map(([line]) => line)
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
