import { describe, expect, it } from 'vitest'
import {
  buildStaleReport,
  findStaleBaselineEntries,
  MIN_STALE_EVIDENCE_LOGS,
  observedRepeatAnnotations,
  observedScopedRepeatKeys,
} from './request-query-profile-stale-report.mts'

describe('request query profile stale report', () => {
  const baseline = [
    { annotation: 'knownRepeat', route: null, maxCount: null, reason: 'r', issue: 1 },
  ]
  it('reports a stale entry without failing', () => {
    const logs = [
      '[pg-request-profile] route=GET /a queries=3 serialDepth=3 repeats=other(x2),third variant(x2)',
      'ts [pg-request-profile] route=GET /b queries=1 serialDepth=1 repeats=none',
    ].join('\n')
    const observed = observedRepeatAnnotations(logs)
    expect([...observed].toSorted()).toEqual(['other', 'third variant'])
    expect(findStaleBaselineEntries(baseline, observed, observedScopedRepeatKeys(logs))).toEqual(
      baseline,
    )
    expect(findStaleBaselineEntries(baseline, new Set(['knownRepeat']), new Set())).toEqual([])
  })

  it('calls an entry stale only when every run log lacks it', () => {
    const entries = [
      { annotation: 'a', route: null, maxCount: null, reason: 'r', issue: 1 },
      { annotation: 'b', route: null, maxCount: null, reason: 'r', issue: 2 },
      { annotation: 'c', route: null, maxCount: null, reason: 'r', issue: 3 },
    ]
    const line = (repeats: string) =>
      `[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=${repeats}`
    const runs = Array.from({ length: MIN_STALE_EVIDENCE_LOGS }, () => line('none'))
    runs[0] = line('a(x2)')
    runs[2] = line('b(x3)')
    const report = buildStaleReport(entries, runs)
    expect(report.stale).toEqual([entries[2]])
    expect(report.logCount).toBe(MIN_STALE_EVIDENCE_LOGS)
    expect(report.sufficient).toBe(true)
  })

  it('counts a scoped exception as observed only on its exact route', () => {
    const entry = { annotation: 'a', route: 'GET /owned', maxCount: 2, reason: 'r', issue: 1 }
    const line = (route: string) =>
      `[pg-request-profile] route=${route} queries=2 serialDepth=2 repeats=a(x2)`
    expect(buildStaleReport([entry], [line('GET /other')]).stale).toEqual([entry])
    expect(buildStaleReport([entry], [line('GET /owned')]).stale).toEqual([])
  })

  it('flags a stale report built from too few logs as insufficient', () => {
    const entries = [{ annotation: 'a', route: null, maxCount: null, reason: 'r', issue: 1 }]
    const report = buildStaleReport(entries, ['[pg-request-profile] route=GET /x repeats=none'])
    expect(report.stale).toEqual(entries)
    expect(report.logCount).toBe(1)
    expect(report.sufficient).toBe(false)
  })
})
