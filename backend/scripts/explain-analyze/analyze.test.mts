import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertNoDisallowedRegressions,
  assertResultsPresent,
  getDisplayName,
  getUserLabel,
} from './analyze.mts'
import { assertNoNewSeqScans } from './seq-scan-baseline.mts'
import { loadLatestPairedResults } from './paired-results.mts'

describe('explain analyze summary helpers', () => {
  it('gates new and stale large-table scans by mode and normalized parent relation', () => {
    const result = (
      name: string,
      relation: string,
      mode: 'force_custom_plan' | 'force_generic_plan',
    ) => ({
      name,
      scenario_id: 'hydration',
      capture_index: 0,
      plan_cache_mode: mode,
      query_text: 'SELECT 1',
      plan: {
        Plan: {
          'Node Type': 'Seq Scan',
          'Relation Name': relation,
          'Actual Rows': 1,
          'Actual Loops': 1,
        },
      },
      execution_time_ms: 1,
      planning_time_ms: 1,
      timestamp: new Date().toISOString(),
    })
    const results = [
      result('monthly', 'crawls__p_2026_10', 'force_custom_plan'),
      result('default', 'posts__default', 'force_generic_plan'),
    ]
    const baseline = {
      'hydration|0|monthly|force_custom_plan': ['crawls'],
      'hydration|0|default|force_generic_plan': ['posts'],
    }
    expect(assertNoNewSeqScans(results, results, baseline)).toEqual({
      onlyFirst: [],
      onlyRepeated: [],
    })
    const withoutDefault = [
      results[0],
      { ...results[1], plan: { Plan: { 'Node Type': 'Result', 'Actual Rows': 1 } } },
    ]
    expect(
      assertNoNewSeqScans(results, withoutDefault, {
        'hydration|0|monthly|force_custom_plan': ['crawls'],
      }),
    ).toEqual({
      onlyFirst: ['hydration|0|default|force_generic_plan:posts'],
      onlyRepeated: [],
    })
    expect(
      assertNoNewSeqScans(withoutDefault, results, {
        'hydration|0|monthly|force_custom_plan': ['crawls'],
      }),
    ).toEqual({
      onlyFirst: [],
      onlyRepeated: ['hydration|0|default|force_generic_plan:posts'],
    })
    expect(assertNoNewSeqScans(results, withoutDefault, baseline)).toEqual({
      onlyFirst: ['hydration|0|default|force_generic_plan:posts'],
      onlyRepeated: [],
    })
    expect(assertNoNewSeqScans(withoutDefault, results, baseline)).toEqual({
      onlyFirst: [],
      onlyRepeated: ['hydration|0|default|force_generic_plan:posts'],
    })
    expect(() =>
      assertNoNewSeqScans(results, results, { ...baseline, 'other|0|old|auto': ['topics'] }),
    ).toThrow('stale [other|0|old|auto:topics]')
    expect(() =>
      assertNoNewSeqScans(results, results, { ...baseline, 'other|0|empty|auto': [] }),
    ).toThrow('stale [other|0|empty|auto]')
    expect(() =>
      assertNoNewSeqScans(results, results, {
        'hydration|0|monthly|force_custom_plan': ['crawls'],
      }),
    ).toThrow('new [hydration|0|default|force_generic_plan:posts]')
    expect(() => assertNoNewSeqScans(results, [results[0]], baseline)).toThrow(
      'changed its query identities',
    )
    expect(() =>
      assertNoNewSeqScans(
        results,
        [results[0], { ...results[1], query_text: 'SELECT 2' }],
        baseline,
      ),
    ).toThrow('changed its query identities')
  })

  it('requires a paired artifact from the same completed scenario manifest', () => {
    const directory = mkdtempSync(join(tmpdir(), 'explain-pair-'))
    const firstPath = join(directory, 'results-2026-10-14T00-00-00-000Z.json')
    const repeatPath = join(directory, 'repeat-2026-10-14T00-00-00-000Z.json')
    try {
      writeFileSync(
        firstPath,
        JSON.stringify({ results: [{ name: 'a' }], completedScenarioIds: ['a'] }),
      )
      expect(() => loadLatestPairedResults(directory)).toThrow('Missing repeated EXPLAIN capture')
      writeFileSync(
        repeatPath,
        JSON.stringify({ results: [{ name: 'a' }], completedScenarioIds: ['b'] }),
      )
      expect(() => loadLatestPairedResults(directory)).toThrow('changed its scenario manifest')
      writeFileSync(
        repeatPath,
        JSON.stringify({ results: [{ name: 'a' }], completedScenarioIds: ['a'] }),
      )
      expect(loadLatestPairedResults(directory).repeatedResults).toEqual([{ name: 'a' }])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

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
