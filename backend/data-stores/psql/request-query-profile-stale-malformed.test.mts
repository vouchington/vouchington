import { describe, expect, it } from 'vitest'
import type { RepeatBaselineEntry } from '../../test-helpers/request-query-profile-baseline.mts'
import { buildStaleReport } from '../../test-helpers/request-query-profile-stale-report.mts'

const identityRoute = (route: string) => route

const permanent = {
  reason: 'r',
  permanent: true as const,
  maxCount: 2,
  code: 'backend/services/example.mts:12',
}

describe('request query profile stale report malformed evidence', () => {
  it('does not infer stale routes when malformed request diagnostics accompany valid ones', () => {
    const entry: RepeatBaselineEntry = {
      ...permanent,
      annotation: 'knownRepeat',
      routes: ['GET /absent'],
    }
    const malformed = [
      '[pg-request-profile] route=GET /truncated queries=3',
      '[pg-request-profile] route=GET /invalid-repeat queries=3 serialDepth=2 repeats=knownRepeat(x1)',
    ]
    const valid = '[pg-request-profile] route=GET /seen queries=3 serialDepth=2 repeats=other(x2)'
    const report = buildStaleReport([entry], [...malformed, valid], identityRoute)

    expect(report.sufficient).toBe(false)
    expect(report.malformedRequestProfileCount).toBe(2)
    expect(report.stale).toEqual([])
  })

  it('does not infer stale workers when malformed worker diagnostics accompany valid ones', () => {
    const entry: RepeatBaselineEntry = {
      ...permanent,
      annotation: 'workerRepeat',
      routes: [],
      workers: [{ queue: 'queue', job: 'absent' }],
    }
    const malformed = '{"kind":"pg-worker-profile","profile":{"identity":'
    const valid = JSON.stringify({
      kind: 'pg-worker-profile',
      profile: {
        identity: { queue: 'queue', jobs: [{ id: 'id', name: 'seen' }] },
        summary: { repeats: [{ annotation: 'otherRepeat', count: 2 }] },
      },
    })
    const report = buildStaleReport([entry], [malformed, valid], identityRoute)

    expect(report.sufficient).toBe(false)
    expect(report.malformedWorkerProfileCount).toBe(1)
    expect(report.stale).toEqual([])
  })

  it('rejects partial worker identities and malformed repeat entries as incomplete evidence', () => {
    const entry: RepeatBaselineEntry = {
      ...permanent,
      annotation: 'workerRepeat',
      routes: [],
      workers: [{ queue: 'queue', job: 'absent' }],
    }
    const line = (profile: unknown) => JSON.stringify({ kind: 'pg-worker-profile', profile })
    const partialJobs = line({
      identity: { queue: 'queue', jobs: [{ name: 'seen' }, null] },
      summary: { repeats: [] },
    })
    const partialRepeats = line({
      identity: { queue: 'queue', jobs: [{ name: 'seen' }] },
      summary: { repeats: [{ annotation: 'otherRepeat', count: 2 }, null] },
    })
    const valid = line({
      identity: { queue: 'queue', jobs: [{ name: 'valid' }] },
      summary: { repeats: [{ annotation: 'otherRepeat', count: 2 }] },
    })
    const report = buildStaleReport([entry], [partialJobs, partialRepeats, valid], identityRoute)

    expect(report.sufficient).toBe(false)
    expect(report.workerProfileCount).toBe(1)
    expect(report.malformedWorkerProfileCount).toBe(2)
    expect(report.stale).toEqual([])
  })
})
