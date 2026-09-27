import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { valkeyEvents } from '@data-stores/valkey/events'
import { stableSerialize } from '@services/entity-cache/search-cache'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  countCapturedQueriesByAnnotation,
  createTestUser,
  enableQueryCapture,
  stopTestQueryCapture,
} from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('platform-stats', () => {
  afterAll(() => cacheValkeyClient.close())

  it('shares one cold platform aggregate with two authenticated viewers and preserves HTTP headers', async () => {
    const anonymous = createRequest()
    const authenticated = [createRequest(), createRequest()]
    for (const request of authenticated) await request.authenticateAs(await createTestUser())

    const key = stableSerialize({})
    const deadline = AbortSignal.timeout(30_000)
    const written = Promise.withResolvers<void>()
    const onWrite = ({ cacheName, keys }: { cacheName: string; keys: string[] }) => {
      if (cacheName === 'platform_stats_anon' && keys.includes(key)) written.resolve()
    }
    const onDeadline = () => written.reject(deadline.reason)
    valkeyEvents.on('cache:set', onWrite)
    deadline.addEventListener('abort', onDeadline, { once: true })
    const timings: number[] = []
    const requestStats = async (request: ReturnType<typeof createRequest>) => {
      const started = performance.now()
      const response = await request.get('/api/v1/platform-stats').expect(200)
      timings.push(performance.now() - started)
      return response
    }
    let queries: ReturnType<typeof stopTestQueryCapture> = []
    const responses = []
    enableQueryCapture()
    try {
      const [cold] = await Promise.all([requestStats(anonymous), written.promise])
      responses.push(cold)
      for (const request of authenticated) responses.push(await requestStats(request))
    } finally {
      queries = stopTestQueryCapture()
      valkeyEvents.off('cache:set', onWrite)
      deadline.removeEventListener('abort', onDeadline)
    }
    const aggregateQueries = countCapturedQueriesByAnnotation(queries, 'getPlatformStats')
    await writeFile(
      join(tmpdir(), `platform-stats-cache-route-${randomUUID()}.json`),
      JSON.stringify(
        {
          aggregateQueries,
          requestMilliseconds: timings,
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
