import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type http from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  buildStaleReport,
  findStaleBaselineEntries,
  MIN_STALE_EVIDENCE_LOGS,
  findUnbaselinedRepeats,
  formatUnbaselinedRepeats,
  observedRepeatAnnotations,
} from './request-query-profile-baseline.mts'
import {
  computeSerialDepth,
  findRepeatedAnnotations,
  formatRequestProfileLine,
  summarizeRequestQueries,
  type RequestQuery,
} from './request-query-profile-summary.mts'
import { createRequestQueryProfile } from './request-query-profile.mts'
import { recordQueryTiming } from './query-telemetry.mts'

function query(annotation: string | null, startMs: number, endMs: number, excluded = false) {
  return { annotation, startMs, endMs, excludedFromRepeats: excluded } satisfies RequestQuery
}

describe('request query profile math', () => {
  it('counts sequential queries as depth and overlapping ones once', () => {
    expect(computeSerialDepth([query('a', 0, 5), query('b', 5, 10), query('c', 10, 12)])).toBe(3)
    expect(computeSerialDepth([query('a', 0, 10), query('b', 1, 9), query('c', 2, 8)])).toBe(1)
    expect(computeSerialDepth([query('a', 0, 5), query('b', 4, 9), query('c', 8, 12)])).toBe(2)
    expect(computeSerialDepth([])).toBe(0)
  })

  it('reports repeated annotations and skips cursor and pipelined batches', () => {
    const queries = [
      query('loadPost', 0, 1),
      query('loadPost', 1, 2),
      query('loadPost', 2, 3),
      query('list', 3, 4),
      query('batched', 4, 5, true),
      query('batched', 5, 6, true),
      query(null, 6, 7),
      query(null, 7, 8),
    ]
    expect(findRepeatedAnnotations(queries)).toEqual([
      { annotation: 'loadPost', count: 3 },
      { annotation: 'unannotated', count: 2 },
    ])
    expect(summarizeRequestQueries(queries).totalQueries).toBe(8)
  })

  it('stays quiet without repeats unless all profiles are requested', () => {
    const summary = summarizeRequestQueries([query('a', 0, 1), query('b', 1, 2)])
    expect(formatRequestProfileLine('GET /x', summary, { all: false })).toBeNull()
    expect(formatRequestProfileLine('GET /x', summary, { all: true })).toBe(
      '[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=none\n',
    )
    const repeated = summarizeRequestQueries([query('a', 0, 1), query('a', 1, 2)])
    expect(formatRequestProfileLine('GET /x', repeated, { all: false })).toBe(
      '[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=a(x2)\n',
    )
  })
})

describe('request query profile attribution', () => {
  const timing = { pool: 'read', durationMs: 0, rowCount: 0, error: false } as const

  it('attributes timing-hook queries to the active scope only', async () => {
    const first = createRequestQueryProfile()
    const second = createRequestQueryProfile()
    recordQueryTiming({ ...timing, annotation: 'outside' })
    await Promise.all([
      first.run(async () => {
        await Promise.resolve()
        recordQueryTiming({ ...timing, annotation: 'one' })
        recordQueryTiming({ ...timing, annotation: 'one', cursorBatches: 3 })
      }),
      second.run(async () => {
        await Promise.resolve()
        recordQueryTiming({ ...timing, annotation: 'two' })
      }),
    ])
    expect(first.summarize().totalQueries).toBe(2)
    expect(first.summarize().repeats).toEqual([])
    expect(second.summarize().totalQueries).toBe(1)
  })
})

const BASELINE_URL = new URL(
  '../../test-helpers/api/request-query-profile-baseline.json',
  import.meta.url,
)
type CommittedEntry = { annotation: string; reason: string; issue: number }

describe('request query profile baseline', () => {
  const baseline = [{ annotation: 'knownRepeat', reason: 'covered by the owning issue', issue: 1 }]
  const repeat = (annotation: string, count = 2) => ({ annotation, count })

  it('allows a baselined repeat and reports a new one naming route and annotation', () => {
    expect(findUnbaselinedRepeats([repeat('knownRepeat', 5)], baseline)).toEqual([])
    const fresh = findUnbaselinedRepeats([repeat('knownRepeat'), repeat('newRepeat', 3)], baseline)
    expect(fresh).toEqual([{ annotation: 'newRepeat', count: 3 }])
    expect(formatUnbaselinedRepeats('GET /v1/things/:id', fresh)).toContain(
      'GET /v1/things/:id: newRepeat (x3)',
    )
  })

  it('reports a stale entry without failing', () => {
    const logs = [
      '[pg-request-profile] route=GET /a queries=3 serialDepth=3 repeats=other(x2),third variant(x2)',
      'ts [pg-request-profile] route=GET /b queries=1 serialDepth=1 repeats=none',
    ].join('\n')
    const observed = observedRepeatAnnotations(logs)
    expect([...observed].toSorted()).toEqual(['other', 'third variant'])
    expect(findStaleBaselineEntries(baseline, observed)).toEqual(baseline)
    expect(findStaleBaselineEntries(baseline, new Set(['knownRepeat']))).toEqual([])
  })

  it('calls an entry stale only when every run log lacks it', () => {
    const entries = [
      { annotation: 'a', reason: 'r', issue: 1 },
      { annotation: 'b', reason: 'r', issue: 2 },
      { annotation: 'c', reason: 'r', issue: 3 },
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

  it('flags a stale report built from too few logs as insufficient', () => {
    const entries = [{ annotation: 'a', reason: 'r', issue: 1 }]
    const report = buildStaleReport(entries, ['[pg-request-profile] route=GET /x repeats=none'])
    expect(report.stale).toEqual(entries)
    expect(report.logCount).toBe(1)
    expect(report.sufficient).toBe(false)
  })

  it('records a violation for a new repeat only, through the response finish handler', async () => {
    const { profileRequestQueries } =
      await import('../../test-helpers/api/request-query-profile.mts')
    const { takeRequestQueryProfileViolations } =
      await import('../../test-helpers/api/request-query-profile-violations.mts')
    const serve = (annotation: string) => {
      const res = new EventEmitter() as unknown as http.ServerResponse
      const req = { method: 'GET', url: '/v1/x?y=1' } as http.IncomingMessage
      profileRequestQueries(req, res, () => {
        recordQueryTiming({ pool: 'read', durationMs: 0, rowCount: 0, error: false, annotation })
        recordQueryTiming({ pool: 'read', durationMs: 0, rowCount: 0, error: false, annotation })
      })
      res.emit('finish')
    }
    const committed = JSON.parse(readFileSync(BASELINE_URL, 'utf8')) as CommittedEntry[]
    serve(committed[0]?.annotation ?? '')
    expect(takeRequestQueryProfileViolations()).toEqual([])
    serve('notInTheBaseline')
    expect(takeRequestQueryProfileViolations()).toEqual([
      expect.stringContaining('GET /v1/x: notInTheBaseline (x2)'),
    ])
  })

  it('keeps every committed entry justified and unique', () => {
    const entries = JSON.parse(readFileSync(BASELINE_URL, 'utf8')) as CommittedEntry[]
    expect(new Set(entries.map(entry => entry.annotation)).size).toBe(entries.length)
    const unjustified = entries.filter(
      ({ annotation, reason, issue }) =>
        annotation === '' || reason === '' || !Number.isInteger(issue) || issue <= 0,
    )
    expect(unjustified).toEqual([])
  })
})
