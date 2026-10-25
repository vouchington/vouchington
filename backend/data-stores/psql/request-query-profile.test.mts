import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import type http from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createRequestQueryProfile } from '../../test-helpers/query-profiles.mts'
import { recordQueryTiming } from './query-timing.mts'
import { createVouchaApiApp } from '../../api/app.mts'

const matcher = createVouchaApiApp()
matcher.route('/api/v1/rss-feeds/trending').get(() => {})
matcher.route('/api/v1/mcp').post(() => {})

const BASELINE_URL = new URL(
  '../../test-helpers/api/request-query-profile-baseline.json',
  import.meta.url,
)

describe('request query profile baseline', () => {
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
        profileRequestQueries(
          req,
          res,
          () => {
            for (let i = 0; i < count; i++) {
              recordQueryTiming({
                pool: 'read',
                durationMs: 0,
                rowCount: 0,
                error: false,
                annotation: 'getRssFeedsByIdBatch',
              })
            }
          },
          matcher,
        )
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
      profileRequestQueries(
        req,
        res,
        () => {
          recordQueryTiming({ pool: 'read', durationMs: 0, rowCount: 0, error: false, annotation })
          recordQueryTiming({ pool: 'read', durationMs: 0, rowCount: 0, error: false, annotation })
        },
        matcher,
      )
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
      profileRequestQueries(
        req,
        res,
        () => {
          recordQueryTiming({
            pool: 'read',
            durationMs: 0,
            rowCount: 0,
            error: false,
            annotation: 'once',
          })
        },
        matcher,
      )
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
    profileRequestQueries(
      req,
      res,
      () => {
        for (let i = 0; i < 2; i++) {
          recordQueryTiming({
            pool: 'read',
            durationMs: 0,
            rowCount: 0,
            error: false,
            annotation: 'repeatBeforeDisconnect',
          })
        }
      },
      matcher,
    )
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
