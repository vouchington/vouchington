import { describe, expect, it } from 'vitest'
import type { RepeatBaselineEntry } from '../../test-helpers/request-query-profile-baseline.mts'
import { collectProfileObservations } from '../../test-helpers/request-query-profile-observations.mts'
import {
  buildStaleReport,
  MIN_STALE_EVIDENCE_LOGS,
} from '../../test-helpers/request-query-profile-stale-report.mts'

const identityRoute = (route: string) => route

describe('request query profile stale report', () => {
  const routeEntry = (
    routes: string[],
    workers: Array<{ queue: string; job: string }> = [],
  ): RepeatBaselineEntry => ({
    annotation: 'knownRepeat',
    routes,
    ...(workers.length === 0 ? {} : { workers }),
    maxCount: 2,
    reason: 'r',
    permanent: true,
    code: 'backend/services/example.mts:12',
  })

  const workerEntry = (workers: Array<{ queue: string; job: string }>): RepeatBaselineEntry => ({
    annotation: 'workerRepeat',
    routes: [],
    workers,
    maxCount: 2,
    reason: 'r',
    permanent: true,
    code: 'backend/workers/example.mts:12',
  })

  const requestLine = (route: string, repeats: string) =>
    `[pg-request-profile] route=${route} queries=3 serialDepth=2 repeats=${repeats}`

  const workerLine = (
    queue: string,
    jobs: Array<{ id: string; name: string }>,
    repeats: string[],
    children: unknown[] = [],
  ) =>
    JSON.stringify({
      kind: 'pg-worker-profile',
      pid: 123,
      profile: {
        identity: { queue, jobs },
        summary: {
          totalQueries: 3,
          serialDepth: 2,
          repeats: repeats.map(annotation => ({ annotation, count: 2 })),
        },
        children,
      },
    })

  it('recognizes exact HTTP scopes and annotations from prefixed request logs', () => {
    const logs = [
      `vitest stderr | ${requestLine('GET /api/v1/things/:id', 'knownRepeat(x2),other(x3)')}`,
      requestLine('GET /quiet', 'none'),
    ].join('\n')

    const observed = collectProfileObservations([logs], identityRoute)
    expect([...observed.routeScopes]).toEqual([
      JSON.stringify(['knownRepeat', 'GET /api/v1/things/:id']),
      JSON.stringify(['other', 'GET /api/v1/things/:id']),
    ])
  })

  it('reports only missing routes and worker identities for partially stale entries', () => {
    const entry = routeEntry(
      ['GET /observed', 'GET /missing'],
      [
        { queue: 'queue-a', job: 'observed-job' },
        { queue: 'queue-b', job: 'missing-job' },
      ],
    )
    const observedWorker = workerLine(
      'queue-a',
      [{ id: 'ephemeral-id-1', name: 'observed-job' }],
      ['knownRepeat'],
      [
        {
          identity: { queue: 'queue-child', jobs: [{ id: 'child-id-1', name: 'child-job' }] },
          summary: {
            totalQueries: 2,
            serialDepth: 2,
            repeats: [{ annotation: 'knownRepeat', count: 2 }],
          },
          children: [],
        },
      ],
    )
    const log = [requestLine('GET /observed', 'knownRepeat(x2)'), observedWorker].join('\n')

    const report = buildStaleReport([entry], [log], identityRoute)
    expect(report.sufficient).toBe(true)
    expect(report.stale).toEqual([
      {
        index: 0,
        entry: {
          ...entry,
          routes: ['GET /missing'],
          workers: [{ queue: 'queue-b', job: 'missing-job' }],
        },
        fullyStale: false,
      },
    ])
    expect([...collectProfileObservations([log], identityRoute).workerScopes]).toEqual([
      JSON.stringify(['knownRepeat', 'queue-a', 'observed-job']),
      JSON.stringify(['knownRepeat', 'queue-child', 'child-job']),
    ])
  })

  it('ignores worker job IDs when matching the queue and job-name scope', () => {
    const entry = workerEntry([{ queue: 'queue-a', job: 'rebuild-index' }])
    const firstId = workerLine(
      'queue-a',
      [{ id: 'job-id-first', name: 'rebuild-index' }],
      ['workerRepeat'],
    )
    const otherId = workerLine(
      'queue-a',
      [{ id: 'job-id-second', name: 'rebuild-index' }],
      ['workerRepeat'],
    )

    expect(buildStaleReport([entry], [firstId], identityRoute).stale).toEqual([])
    expect(buildStaleReport([entry], [otherId], identityRoute).stale).toEqual([])
  })

  it('marks a whole entry stale only when every named scope is absent', () => {
    const entry = routeEntry(['GET /one', 'GET /two'], [{ queue: 'queue-a', job: 'job-a' }])
    const log = [
      requestLine('GET /seen', 'otherRepeat(x2)'),
      workerLine('queue-other', [{ id: 'id', name: 'other-job' }], ['otherRepeat']),
    ].join('\n')
    const report = buildStaleReport([entry], [log], identityRoute)

    expect(report.sufficient).toBe(true)
    expect(report.stale).toEqual([
      {
        index: 0,
        entry: {
          ...entry,
          routes: ['GET /one', 'GET /two'],
          workers: [{ queue: 'queue-a', job: 'job-a' }],
        },
        fullyStale: true,
      },
    ])
  })

  it('does not infer stale routes or workers from empty or missing diagnostics', () => {
    const entry = routeEntry(['GET /route'], [{ queue: 'queue', job: 'job' }])
    const emptyReport = buildStaleReport([entry], [], identityRoute)
    const noDiagnosticsReport = buildStaleReport(
      [entry],
      ['test output without profiles'],
      identityRoute,
    )

    expect(MIN_STALE_EVIDENCE_LOGS).toBe(1)
    expect(emptyReport).toMatchObject({ logCount: 0, sufficient: false, stale: [] })
    expect(noDiagnosticsReport).toMatchObject({ logCount: 1, sufficient: false, stale: [] })
  })

  it('uses evidence only for the diagnostic kind present in a log', () => {
    const entry = routeEntry(['GET /missing'], [{ queue: 'queue', job: 'job' }])
    const report = buildStaleReport(
      [entry],
      [requestLine('GET /seen', 'otherRepeat(x2)')],
      identityRoute,
    )

    expect(report.sufficient).toBe(false)
    expect(report.stale).toEqual([
      {
        index: 0,
        entry: { ...entry, routes: ['GET /missing'], workers: [] },
        fullyStale: false,
      },
    ])
  })

  it('does not count malformed or identity-less worker profiles as evidence', () => {
    const entry = workerEntry([{ queue: 'queue', job: 'job' }])
    const malformed = JSON.stringify({
      kind: 'pg-worker-profile',
      profile: {
        identity: { queue: 'queue', jobs: [] },
        summary: {},
        children: [],
      },
    })
    const report = buildStaleReport([entry], [malformed], identityRoute)

    expect(report.sufficient).toBe(false)
    expect(report.workerProfileCount).toBe(0)
    expect(report.stale).toEqual([])
  })
})
