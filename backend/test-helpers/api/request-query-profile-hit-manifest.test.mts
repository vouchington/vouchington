import { describe, expect, it } from 'vitest'
import { parseRepeatBaseline } from 'vouchington-tooling/request-query-profile'
import {
  buildStaleReportFromHitManifests,
  collectQueryProfileHitManifest,
} from './request-query-profile-hit-manifest.mts'

const baseline = parseRepeatBaseline([
  {
    annotation: 'observedRepeat',
    maxCount: 2,
    reason: 'A repeated query is necessary for this test contract.',
    permanent: true,
    code: 'backend/test-helpers/api/request-query-profile-hit-manifest.test.mts:1',
    routes: ['GET /observed', 'GET /absent'],
  },
])

describe('query-profile hit manifest', () => {
  it('reports only absent scopes after merging a complete diagnostic corpus', () => {
    const first = collectQueryProfileHitManifest(
      baseline,
      '[pg-request-profile] route=GET /observed queries=2 serialDepth=2 repeats=observedRepeat(x2)',
      1,
      2,
      route => route,
    )
    const second = collectQueryProfileHitManifest(
      baseline,
      '[pg-request-profile] route=GET /other queries=1 serialDepth=1 repeats=none',
      2,
      2,
      route => route,
    )

    expect(first.routeHits).toEqual([JSON.stringify(['observedRepeat', 'GET /observed'])])
    const report = buildStaleReportFromHitManifests(baseline, [first, second])
    expect(report.sufficient).toBe(true)
    expect(report.stale).toEqual([
      expect.objectContaining({
        entry: expect.objectContaining({ routes: ['GET /absent'] }),
        fullyStale: false,
      }),
    ])
    expect(() => buildStaleReportFromHitManifests(baseline, [first])).toThrow(
      'Invalid query-profile hit manifest',
    )
    expect(() =>
      buildStaleReportFromHitManifests(baseline, [
        { ...first, routeHits: [JSON.stringify(['observedRepeat', 'GET /invented'])] },
        second,
      ]),
    ).toThrow('Invalid query-profile hit manifest')
  })
})
