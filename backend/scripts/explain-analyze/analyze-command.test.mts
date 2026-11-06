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
})
