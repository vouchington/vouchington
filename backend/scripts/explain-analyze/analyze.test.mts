import { describe, expect, it } from 'vitest'
import {
  assertNoDisallowedRegressions,
  assertResultsPresent,
  getDisplayName,
  getUserLabel,
} from './analyze.mts'

describe('explain analyze summary helpers', () => {
  it('classifies names without suffixes as baseline even when they contain heavy', () => {
    expect(getUserLabel('get_heavy_posts')).toBe('baseline')
  })

  it('classifies heavy suffix variants as heavy', () => {
    expect(getUserLabel('get_posts:heavy')).toBe('heavy')
    expect(getUserLabel('get_posts:heavy-follow-users')).toBe('heavy')
  })

  it('strips generic heavy suffixes from display names', () => {
    expect(getDisplayName('get_posts:heavy')).toBe('get_posts')
    expect(getDisplayName('get_heavy_posts')).toBe('get_heavy_posts')
  })

  it('preserves named heavy variants in display names', () => {
    expect(getDisplayName('get_posts:heavy-follow-users')).toBe('get_posts:heavy-follow-users')
  })

  it('rejects empty result sets', () => {
    expect(() => assertResultsPresent([])).toThrow('contains no query results')
  })

  it('rejects disallowed resource pressure', () => {
    expect(() =>
      assertNoDisallowedRegressions([
        {
          name: 'spilling-query',
          query_text: 'SELECT 1',
          plan: { Plan: { 'Node Type': 'Sort', 'Temp Written Blocks': 1 } },
          execution_time_ms: 1,
          planning_time_ms: 1,
          timestamp: new Date().toISOString(),
        },
      ]),
    ).toThrow('spilling-query')
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
      assertNoDisallowedRegressions([pressureResult], {
        [identity]: ['Sort:posts:temp-written'],
      }),
    ).not.toThrow()
    expect(() =>
      assertNoDisallowedRegressions([pressureResult], {
        [identity]: ['Sort:posts:temp-read'],
      }),
    ).toThrow('temp-written')
  })
})
