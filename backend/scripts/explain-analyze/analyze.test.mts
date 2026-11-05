import { describe, expect, it, vi } from 'vitest'
import fs, { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(assertNoNewSeqScans([results[0]], [results[0]], baseline)).toEqual({
      onlyFirst: [],
      onlyRepeated: [],
    })
    const autoResults = [{ ...results[0], plan_cache_mode: 'auto' as const }]
    expect(assertNoNewSeqScans(autoResults, autoResults, baseline)).toEqual({
      onlyFirst: [],
      onlyRepeated: [],
    })
    const newCustomScan = [result('monthly', 'posts', 'force_custom_plan')]
    expect(() => assertNoNewSeqScans(newCustomScan, newCustomScan, baseline)).toThrow(
      'new [hydration|0|monthly|force_custom_plan:posts]',
    )
    expect(() =>
      assertNoNewSeqScans(results, results, {
        ...baseline,
        'other|0|old|force_custom_plan': ['topics'],
      }),
    ).toThrow('stale [other|0|old|force_custom_plan:topics]')
    expect(() =>
      assertNoNewSeqScans(results, results, {
        ...baseline,
        'other|0|empty|force_generic_plan': [],
      }),
    ).toThrow('stale [other|0|empty|force_generic_plan]')
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
})

describe('explain analyze CLI import', () => {
  it('does not read the output corpus, write a summary, or exit when imported', async () => {
    const outputDir = join(import.meta.dirname, 'output')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('CLI exited while imported')
    })
    const original = fs.readdirSync
    const readDir = vi.spyOn(fs, 'readdirSync')
    readDir.mockImplementation((...args) => {
      if (String(args[0]) === outputDir)
        throw new Error('CLI read its output corpus while imported')
      return original(...args)
    })
    syncBuiltinESMExports()
    try {
      await expect(import('./analyze.mts')).resolves.toBeDefined()
      expect(readDir.mock.calls.filter(([path]) => String(path) === outputDir)).toHaveLength(0)
      expect(log).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(exit).not.toHaveBeenCalled()
    } finally {
      readDir.mockRestore()
      syncBuiltinESMExports()
      exit.mockRestore()
      error.mockRestore()
      log.mockRestore()
    }
  })
})
