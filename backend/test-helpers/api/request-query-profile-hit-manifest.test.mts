import { describe, expect, it } from 'vitest'
import { parseRepeatBaseline } from 'vouchington-tooling/request-query-profile'
import { collectQueryProfileHitManifest } from './request-query-profile-hit-manifest.mts'
import { checkQueryProfileManifests } from './request-query-profile-manifest-check.mts'

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

    expect(first.missingScopes).toEqual([1])
    const report = checkQueryProfileManifests(baseline, [first, second])
    expect(report.sufficient).toBe(true)
    expect(report.staleScopes).toEqual(['observedRepeat route=GET /absent'])
    expect(() => checkQueryProfileManifests(baseline, [first])).toThrow(
      'Invalid query-profile hit manifest',
    )
  })

  it('keeps empty-shard absence until a complete corpus provides diagnostic evidence', () => {
    const empty = collectQueryProfileHitManifest(baseline, '', 1, 2, route => route)
    const observed = collectQueryProfileHitManifest(
      baseline,
      '[pg-request-profile] route=GET /observed queries=2 serialDepth=2 repeats=observedRepeat(x2)',
      2,
      2,
      route => route,
    )
    expect(empty.missingScopes).toEqual([0, 1])
    expect(checkQueryProfileManifests(baseline, [empty, observed]).staleScopes).toEqual([
      'observedRepeat route=GET /absent',
    ])
    expect(
      checkQueryProfileManifests(baseline, [empty, { ...observed, requestProfileCount: 0 }])
        .sufficient,
    ).toBe(false)
  })

  it('intersects missing request and worker scopes across shards', () => {
    const mixed = parseRepeatBaseline([
      {
        annotation: 'mixedRepeat',
        maxCount: 2,
        reason: 'A repeated query is necessary for this test contract.',
        permanent: true,
        code: 'backend/test-helpers/api/request-query-profile-hit-manifest.test.mts:1',
        routes: ['GET /one', 'GET /two'],
        workers: [
          { queue: 'queue-a', job: 'one' },
          { queue: 'queue-a', job: 'two' },
        ],
      },
    ])
    const workerLine = (job: string) =>
      JSON.stringify({
        kind: 'pg-worker-profile',
        profile: {
          identity: { queue: 'queue-a', jobs: [{ name: job }] },
          summary: { repeats: [{ annotation: 'mixedRepeat', count: 2 }] },
        },
      })
    const first = collectQueryProfileHitManifest(
      mixed,
      `[pg-request-profile] route=GET /one queries=2 serialDepth=2 repeats=mixedRepeat(x2)\n${workerLine('one')}`,
      1,
      2,
      route => route,
    )
    const second = collectQueryProfileHitManifest(
      mixed,
      `[pg-request-profile] route=GET /other queries=1 serialDepth=1 repeats=none\n${workerLine('two')}`,
      2,
      2,
      route => route,
    )
    expect(first.missingScopes).toEqual([1, 3])
    expect(second.missingScopes).toEqual([0, 1, 2])
    expect(checkQueryProfileManifests(mixed, [first, second])).toEqual({
      sufficient: true,
      scopeCount: 4,
      shardCount: 2,
      requestProfileCount: 2,
      workerProfileCount: 2,
      staleScopes: ['mixedRepeat route=GET /two'],
    })
    expect(
      checkQueryProfileManifests(mixed, [
        { ...first, workerProfileCount: 0 },
        { ...second, workerProfileCount: 0 },
      ]).sufficient,
    ).toBe(false)
    expect(
      checkQueryProfileManifests(mixed, [first, { ...second, malformedWorkerProfileCount: 1 }])
        .sufficient,
    ).toBe(false)
  })
})
