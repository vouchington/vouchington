import type { Response } from 'supertest'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { valkeyEvents } from 'valkyries'
import { stableSerialize } from '@services/entity-cache/search-cache'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countCapturedQueriesByAnnotation, createTestUser } from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getPlatformStatsCached } from '@services/entity-fetch/search-caches'
import { createPlatformStatsLifecycle } from '@voucha/test-helpers/platform-stats-lifecycle'

describe('platform-stats', () => {
  afterAll(() => cacheValkeyClient.close())

  it('serializes the published platform snapshot as JSON', async () => {
    const lifecycle = await createPlatformStatsLifecycle()
    await lifecycle.withServer(async (address, _cache, serverLifecycle) => {
      const expected = await serverLifecycle.trackWork(() => getPlatformStatsCached({}))
      const response = await createRequest(address).get('/api/v1/platform-stats').expect(200)
      expect(response.body).toEqual(expected)
    })
  })

  it('shares one cold platform aggregate with two authenticated viewers and preserves HTTP headers', async () => {
    const lifecycle = await createPlatformStatsLifecycle()
    const key = stableSerialize({})
    const written = Promise.withResolvers<void>()
    void written.promise.catch(() => undefined)
    const onWrite = ({ cacheName, keys }: { cacheName: string; keys: string[] }) => {
      if (cacheName === 'platform_stats_anon' && keys.includes(key)) written.resolve()
    }
    const responses: Response[] = []
    await lifecycle.withServer(async (address, _cache, serverLifecycle) => {
      const requestStats = (request: ReturnType<typeof createRequest>) =>
        request.get('/api/v1/platform-stats').expect(200)
      const anonymous = createRequest(address)
      const authenticated = [createRequest(address), createRequest(address)]
      await serverLifecycle.trackWork(async () => {
        for (const request of authenticated) await request.authenticateAs(await createTestUser())
      })
      lifecycle.cleanupAfterDrain(() => {
        valkeyEvents.off('cache:set', onWrite)
        written.reject(new Error('Stats lifecycle closed before cache write event'))
      })
      valkeyEvents.on('cache:set', onWrite)
      lifecycle.captureQueries()
      const [cold] = await Promise.all([requestStats(anonymous), written.promise])
      responses.push(cold)
      for (const request of authenticated) responses.push(await requestStats(request))
    })
    const queries = lifecycle.stopQueries()
    const aggregateQueries = countCapturedQueriesByAnnotation(queries, 'getPlatformStats')
    await writeFile(
      join(tmpdir(), `platform-stats-cache-route-${randomUUID()}.json`),
      JSON.stringify(
        {
          aggregateQueries,
          responses: responses.map(response => ({
            body: response.body,
            cacheControl: response.headers['cache-control'] ?? null,
          })),
          aggregateSql: queries
            .filter(query => query.text.includes('/* getPlatformStats */'))
            .map(query => query.text),
        },
        null,
        2,
      ),
    )
    expect(aggregateQueries).toBe(1)
    for (const response of responses) {
      expect(response.body).toEqual(responses[0].body)
      for (const field of [
        'topic_count',
        'rss_feed_count',
        'post_count',
        'review_count',
        'data_point_count',
        'hostname_count',
      ]) {
        expect(response.body).toHaveProperty(field)
        expect(typeof response.body[field]).toBe('number')
      }
    }
    expect(responses[0].headers['cache-control']).toContain('public')
    expect(responses[0].headers['cache-control']).toContain(
      `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
    )
    for (const response of responses.slice(1))
      expect(response.headers['cache-control'] ?? '').not.toContain('public')
  })

  it('drains a request admitted before identity dispatch when cleanup starts before its response', async () => {
    const lifecycle = await createPlatformStatsLifecycle()
    await lifecycle.withServer(async (address, _cache, serverLifecycle) => {
      const admitted = serverLifecycle.nextAdmission()
      const requestId = randomUUID()
      lifecycle.captureQueries()
      const response = createRequest(address)
        .get('/api/v1/platform-stats')
        .set('x-request-id', requestId)
        .expect(200)
        .then(result => result)
      const receipt = await admitted
      // This direct continuation runs before the anonymous identity await resumes.
      const drained = serverLifecycle.closeAndDrain()
      const completed = Promise.all([response, drained])
      void completed.catch(() => undefined)
      expect(receipt).toEqual({
        method: 'GET',
        path: '/api/v1/platform-stats',
        requestId,
        hasCookie: false,
        aggregateQueriesAtAdmission: 0,
      })
      await completed
      expect(serverLifecycle.observations()).toEqual({
        cleanupStarted: true,
        responsesFinishedAfterCleanup: [true],
      })
    })
    expect(countCapturedQueriesByAnnotation(lifecycle.stopQueries(), 'getPlatformStats')).toBe(1)
  })

  it('runs the registered finalizer while the caller body is still pending', async () => {
    const lifecycle = await createPlatformStatsLifecycle()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let bodySettled = false
    let finiteWorkStarted = false
    let finiteWorkSettled = false
    lifecycle.captureQueries()
    const running = lifecycle.withServer(async (address, _cache, serverLifecycle) => {
      await createRequest(address).get('/api/v1/platform-stats').expect(200)
      const finiteWork = serverLifecycle.trackWork(async () => {
        finiteWorkStarted = true
        await createTestUser()
        finiteWorkSettled = true
      })
      entered.resolve()
      await release.promise
      await finiteWork
      bodySettled = true
    })
    const settledRunning = running.then(
      () => ({ status: 'fulfilled' as const }),
      err => ({ status: 'rejected' as const, reason: err }),
    )
    try {
      await Promise.race([entered.promise, running])
      expect({ finiteWorkStarted, finiteWorkSettled }).toEqual({
        finiteWorkStarted: true,
        finiteWorkSettled: false,
      })
      await lifecycle.close()
      expect(finiteWorkSettled).toBe(true)
      expect(bodySettled).toBe(false)
      expect(lifecycle.observations()).toEqual({
        closing: true,
        reservationReleased: true,
        servers: 1,
        serversDrained: 1,
        queryCaptureActive: false,
      })
      expect(countCapturedQueriesByAnnotation(lifecycle.stopQueries(), 'getPlatformStats')).toBe(1)
    } finally {
      release.resolve()
      await settledRunning
    }
    const outcome = await settledRunning
    if (outcome.status === 'rejected') throw outcome.reason
  })

  it('fences a real detached cache write after HTTP completion and permits the next cold fill', async () => {
    const lifecycle = await createPlatformStatsLifecycle()
    lifecycle.captureQueries()
    const observed = await lifecycle.withServer(async (address, cache) => {
      await createRequest(address).get('/api/v1/platform-stats').expect(200)
      await cache.entered
      // HTTP has completed while the actual conditional cache write is still held.
      // Cleanup installs its exact-key marker before releasing that write.
      return cache
    }, true)
    expect(observed.observations()).toEqual({ held: true, skipped: 1 })
    await observed.assertMarkerRemoved()
    await lifecycle.withServer(async address => {
      await createRequest(address).get('/api/v1/platform-stats').expect(200)
    })
    expect(countCapturedQueriesByAnnotation(lifecycle.stopQueries(), 'getPlatformStats')).toBe(2)
  })
})
