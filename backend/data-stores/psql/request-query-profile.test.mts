import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type http from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  findUnbaselinedRepeats,
  formatUnbaselinedRepeats,
} from '../../test-helpers/request-query-profile-baseline.mts'
import {
  createRequestQueryProfile,
  type RequestQuerySummary,
} from '../../test-helpers/query-profiles.mts'
import { formatRequestProfileLine } from '../../test-helpers/request-query-profile-line.mts'
import { recordQueryTiming } from './query-timing.mts'

const summary = (repeats: RequestQuerySummary['repeats']): RequestQuerySummary => ({
  totalQueries: 2,
  serialDepth: 2,
  repeats,
})

describe('request profile line', () => {
  it('stays quiet without repeats unless all profiles are requested', () => {
    expect(formatRequestProfileLine('GET /x', summary([]), { all: false })).toBeNull()
    expect(formatRequestProfileLine('GET /x', summary([]), { all: true })).toBe(
      '[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=none\n',
    )
    expect(
      formatRequestProfileLine('GET /x', summary([{ annotation: 'a', count: 2 }]), { all: false }),
    ).toBe('[pg-request-profile] route=GET /x queries=2 serialDepth=2 repeats=a(x2)\n')
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

describe('request query profile baseline', () => {
  const baseline = [
    {
      annotation: 'knownRepeat',
      routes: ['GET /v1/things/:id'],
      maxCount: null,
      reason: 'r',
      issue: 1,
    },
  ]
  const repeat = (annotation: string, count = 2) => ({ annotation, count })

  it('allows an exact route and reports new annotations and unlisted routes', () => {
    expect(
      findUnbaselinedRepeats('GET /v1/things/:id', [repeat('knownRepeat', 5)], baseline),
    ).toEqual([])
    const fresh = findUnbaselinedRepeats(
      'GET /v1/things/:id',
      [repeat('knownRepeat'), repeat('newRepeat', 3)],
      baseline,
    )
    expect(fresh).toEqual([{ annotation: 'newRepeat', count: 3 }])
    expect(formatUnbaselinedRepeats('GET /v1/things/:id', fresh)).toContain(
      'GET /v1/things/:id: newRepeat (x3)',
    )
    expect(findUnbaselinedRepeats('GET /v1/other', [repeat('knownRepeat')], baseline)).toEqual([
      repeat('knownRepeat'),
    ])
  })

  it('allows exactly two on the named route while guarding other routes and a third query', () => {
    const scoped = [
      {
        annotation: 'getRssFeedsByIdBatch',
        routes: ['GET /api/v1/rss-feeds/trending'],
        maxCount: 2,
        reason: 'r',
        permanent: true as const,
        code: 'backend/services/entity-fetch/rss-feeds.mts:12',
      },
    ]
    const repeats = [repeat('getRssFeedsByIdBatch', 2)]
    expect(findUnbaselinedRepeats(scoped[0]!.routes[0]!, repeats, scoped)).toEqual([])
    expect(findUnbaselinedRepeats('GET /api/v1/rss-feeds/recommended', repeats, scoped)).toEqual(
      repeats,
    )
    const three = [repeat('getRssFeedsByIdBatch', 3)]
    expect(findUnbaselinedRepeats(scoped[0]!.routes[0]!, three, scoped)).toEqual(three)
  })

  it('keeps worker-only annotations out of request matching', () => {
    const workerOnly = [
      {
        annotation: 'workerRepeat',
        routes: [],
        workers: [{ queue: 'background', job: 'refresh' }],
        maxCount: null,
        reason: 'r',
        permanent: true as const,
        code: 'backend/workers/refresh.mts:12',
      },
    ]
    expect(findUnbaselinedRepeats('GET /v1/things', [repeat('workerRepeat')], workerOnly)).toEqual([
      repeat('workerRepeat'),
    ])
  })

  it('applies separate counts to disjoint routes of the same annotation', () => {
    const entries = [
      { annotation: 'recheck', routes: ['GET /one'], maxCount: 2, reason: 'r', issue: 1 },
      { annotation: 'recheck', routes: ['GET /two'], maxCount: 3, reason: 'r', issue: 1 },
    ]
    expect(findUnbaselinedRepeats('GET /one', [repeat('recheck', 3)], entries)).toEqual([
      repeat('recheck', 3),
    ])
    expect(findUnbaselinedRepeats('GET /two', [repeat('recheck', 3)], entries)).toEqual([])
    expect(findUnbaselinedRepeats('GET /unknown', [repeat('recheck', 2)], entries)).toEqual([
      repeat('recheck', 2),
    ])
  })

  it('attributes queries recorded by a module instance loaded after vi.resetModules()', async () => {
    const profile = createRequestQueryProfile()
    vi.resetModules()
    const fresh = await import('./query-timing.mts')
    profile.run(() => {
      fresh.recordQueryTiming({
        pool: 'read',
        durationMs: 0,
        rowCount: 0,
        error: false,
        annotation: 'afterReset',
      })
    })
    expect(profile.summarize().totalQueries).toBe(1)
  })

  it('guards the profiled trending request at exactly two RSS batch queries', async () => {
    const { profileRequestQueries } =
      await import('../../test-helpers/api/request-query-profile.mts')
    const { withRequestQueryProfileGuard } =
      await import('../../test-helpers/api/request-query-profile-violations.mts')
    const serve = (url: string, count: number) =>
      withRequestQueryProfileGuard(async () => {
        const res = new EventEmitter() as unknown as http.ServerResponse
        const req = { method: 'GET', url, headers: {} } as http.IncomingMessage
        profileRequestQueries(req, res, () => {
          for (let i = 0; i < count; i++) {
            recordQueryTiming({
              pool: 'read',
              durationMs: 0,
              rowCount: 0,
              error: false,
              annotation: 'getRssFeedsByIdBatch',
            })
          }
        })
        res.emit('finish')
      })
    await expect(serve('/api/v1/rss-feeds/trending?limit=30', 2)).resolves.toBeUndefined()
    await expect(serve('/api/v1/rss-feeds/trending', 3)).rejects.toThrow(
      'GET /api/v1/rss-feeds/trending: getRssFeedsByIdBatch (x3)',
    )
    await expect(serve('/api/v1/rss-feeds/recommended', 2)).rejects.toThrow(
      'GET /api/v1/rss-feeds/recommended: getRssFeedsByIdBatch (x2)',
    )
  })

  it('enforces new repeats without writing routine diagnostics by default', async () => {
    const { profileRequestQueries } =
      await import('../../test-helpers/api/request-query-profile.mts')
    const { takeRequestQueryProfileViolations } =
      await import('../../test-helpers/api/request-query-profile-violations.mts')
    const serve = (annotation: string, method = 'GET', url = '/v1/x?y=1') => {
      const res = new EventEmitter() as unknown as http.ServerResponse
      const req = { method, url, headers: {} } as http.IncomingMessage
      profileRequestQueries(req, res, () => {
        recordQueryTiming({ pool: 'read', durationMs: 0, rowCount: 0, error: false, annotation })
        recordQueryTiming({ pool: 'read', durationMs: 0, rowCount: 0, error: false, annotation })
      })
      res.emit('finish')
    }
    const committed = JSON.parse(readFileSync(BASELINE_URL, 'utf8')) as {
      annotation: string
      routes: string[]
    }[]
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv('VITEST_DIAGNOSTICS', undefined)
    try {
      const scopedBaseline = committed.find(entry => entry.annotation === 'addListItem')
      expect(scopedBaseline).toBeDefined()
      serve(scopedBaseline?.annotation ?? '', 'POST', '/api/v1/mcp')
      expect(takeRequestQueryProfileViolations()).toEqual([])
      serve('notInTheBaseline')
      expect(takeRequestQueryProfileViolations()).toEqual([
        expect.stringContaining('GET /v1/x: notInTheBaseline (x2)'),
      ])
      expect(stderrSpy).not.toHaveBeenCalled()
    } finally {
      stderrSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('prints a profile for every request when diagnostics are enabled', async () => {
    const { profileRequestQueries } =
      await import('../../test-helpers/api/request-query-profile.mts')
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')
    try {
      const res = new EventEmitter() as unknown as http.ServerResponse
      const req = { method: 'GET', url: '/v1/quiet', headers: {} } as http.IncomingMessage
      profileRequestQueries(req, res, () => {
        recordQueryTiming({
          pool: 'read',
          durationMs: 0,
          rowCount: 0,
          error: false,
          annotation: 'once',
        })
      })
      res.emit('finish')
      expect(stderrSpy).toHaveBeenCalledWith(
        '[pg-request-profile] route=GET /v1/quiet queries=1 serialDepth=1 repeats=none\n',
      )
    } finally {
      stderrSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('records repeats on an aborted response and finalizes only once', async () => {
    const { profileRequestQueries } =
      await import('../../test-helpers/api/request-query-profile.mts')
    const { takeRequestQueryProfileViolations } =
      await import('../../test-helpers/api/request-query-profile-violations.mts')
    const res = new EventEmitter() as unknown as http.ServerResponse
    const req = { method: 'GET', url: '/v1/aborted', headers: {} } as http.IncomingMessage
    profileRequestQueries(req, res, () => {
      for (let i = 0; i < 2; i++) {
        recordQueryTiming({
          pool: 'read',
          durationMs: 0,
          rowCount: 0,
          error: false,
          annotation: 'repeatBeforeDisconnect',
        })
      }
    })
    res.emit('close')
    expect(takeRequestQueryProfileViolations()).toEqual([
      expect.stringContaining('GET /v1/aborted: repeatBeforeDisconnect (x2)'),
    ])
    res.emit('finish')
    expect(takeRequestQueryProfileViolations()).toEqual([])
  })

  it('drains the native guard after work and preserves both a request and profile failure', async () => {
    const {
      recordRequestQueryProfileViolation,
      takeRequestQueryProfileViolations,
      withRequestQueryProfileGuard,
    } = await import('../../test-helpers/api/request-query-profile-violations.mts')
    takeRequestQueryProfileViolations()
    const primary = new Error('request failed')
    await expect(
      withRequestQueryProfileGuard(async () => {
        recordRequestQueryProfileViolation('query repeated')
        throw primary
      }),
    ).rejects.toMatchObject({
      errors: [primary, expect.objectContaining({ message: 'query repeated' })],
    })
    expect(takeRequestQueryProfileViolations()).toEqual([])
  })
})
