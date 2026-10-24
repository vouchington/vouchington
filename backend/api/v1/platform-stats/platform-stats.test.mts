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
    await lifecycle.withServer(async (address, trackWork) => {
      const expected = await trackWork(() => getPlatformStatsCached({}))
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
    await lifecycle.withServer(async (address, trackWork) => {
      const requestStats = (request: ReturnType<typeof createRequest>) =>
        request.get('/api/v1/platform-stats').expect(200)
      const anonymous = createRequest(address)
      const authenticated = [createRequest(address), createRequest(address)]
      await trackWork(async () => {
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
})
