import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { getExternalFetch } from '@modules/utils/http-dispatchers'
import { encodeCursor } from '@modules/pagination'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { updateRssFeedById } from '@services/rss-feeds/update'
import app, { createApiRequestGuardedListener } from '../../api/app.mts'
import '../../api/index.mts'
import { withOwnedApiServer } from '../../test-helpers/api-query-options-server.mts'
import { withRequestQueryProfileGuard } from '../../test-helpers/api/request-query-profile-violations.mts'
import { insertEntityRelation } from '../../test-helpers/entities/entity-relations.mts'
import { createTestUserDirect } from '../../test-helpers/entities/users-direct.mts'
import { createNativeTrendingFeed } from '../../test-helpers/native-trending-rss-feeds.mts'

interface TrendingHttpBody {
  results: Array<{ id: string }>
  page_info: { has_next_page: boolean; end_cursor: string | null }
  rss_feeds: Record<string, unknown>
}

function boundaryAfter(feedId: string): string {
  const hex = (BigInt(`0x${feedId.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
  const id = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
  return encodeCursor({ id, score: 3 })
}

/** Real HTTP route and populated MV assertions moved from backend-data-stores Vitest. */
export async function checkTrendingHttpContracts(): Promise<void> {
  const admin = await createTestUserDirect({ administrator: true, withEmail: true })
  const feedIds = await Promise.all([
    createNativeTrendingFeed(0, admin.id),
    createNativeTrendingFeed(0, admin.id),
    createNativeTrendingFeed(0, admin.id),
  ])
  const [trendingId, hiddenId, secondaryId] = feedIds.toSorted().toReversed()
  assert.ok(trendingId && hiddenId && secondaryId)
  await updateRssFeedById(hiddenId, { discoverable: false })
  for (const feedId of [trendingId, hiddenId, secondaryId]) {
    await insertEntityRelation('relation__user__follow__rss_feed', admin.id, feedId)
  }
  await refreshMaterializedView('mv_trending_rss_feeds')

  const userAgent = `VouchaNativeMv/${crypto.randomUUID()}`
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did: v7(),
    uid: admin.id,
    deviceContext: { user_agent: userAgent },
  })
  const cookie = `dt=${deviceToken.token}; st=${sessionToken.token}`
  const requestFetch = getExternalFetch()
  let requestCounter = 0

  await withRequestQueryProfileGuard(() =>
    withOwnedApiServer(createApiRequestGuardedListener(app.callback()), async address => {
      const host = address.host === '::1' ? '[::1]' : address.host
      const origin = `http://${host}:${address.port}`
      async function getTrending(
        query: Record<string, string | number>,
        authenticated = false,
      ): Promise<{ body: TrendingHttpBody; headers: Headers }> {
        const url = new URL('/api/v1/rss-feeds/trending', origin)
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
        requestCounter += 1
        const headers: Record<string, string> = {
          'user-agent': userAgent,
          'x-forwarded-for': `2001:db8:3163:${(process.pid & 0xffff).toString(16)}::${requestCounter.toString(16)}`,
          'x-voucha-client': 'web',
          'x-voucha-platform': 'web',
          'x-voucha-app-version': 'test',
        }
        if (process.env.CF_WORKER_SECRET)
          headers['x-cf-worker-secret'] = process.env.CF_WORKER_SECRET
        if (authenticated) {
          headers.cookie = cookie
          headers['sec-fetch-site'] = 'same-origin'
        }
        const response = await requestFetch(url, { headers })
        if (response.status !== 200) {
          throw new Error(
            `${url.pathname}${url.search}: HTTP ${response.status}: ${await response.text()}`,
          )
        }
        return {
          body: (await response.json()) as TrendingHttpBody,
          headers: response.headers,
        }
      }

      for (const timeRange of ['week', 'month']) {
        const unscoped = await getTrending({ time_range: timeRange })
        assert.ok(Array.isArray(unscoped.body.results))
        assert.ok(unscoped.headers.get('cache-control')?.includes('public'))
        const owned = await getTrending({ time_range: timeRange, after: boundaryAfter(trendingId) })
        assert.equal(owned.body.results[0]?.id, trendingId)
        assert.ok(owned.body.rss_feeds[trendingId])
      }

      const ownedBoundary = boundaryAfter(trendingId)
      const large = await getTrending({ limit: 100, min_score: 3, after: ownedBoundary }, true)
      const largeIds = large.body.results.map(row => row.id)
      assert.ok(largeIds.includes(trendingId))
      assert.ok(!largeIds.includes(hiddenId))
      assert.equal(large.headers.get('cache-control'), null)
      const enabled = await getTrending({ limit: 1, min_score: 3, after: ownedBoundary }, true)
      assert.equal(enabled.body.results[0]?.id, trendingId)
      const hidden = await getTrending(
        { limit: 1, min_score: 3, after: boundaryAfter(hiddenId) },
        true,
      )
      assert.equal(hidden.body.results.length, 1)
      assert.notEqual(hidden.body.results[0]?.id, hiddenId)
      const belowThreshold = await getTrending(
        { limit: 100, min_score: 4, after: ownedBoundary },
        true,
      )
      assert.deepEqual(belowThreshold.body.results, [])

      const first = await getTrending({ limit: 1, min_score: 3, after: ownedBoundary }, true)
      assert.equal(first.body.results[0]?.id, trendingId)
      assert.equal(first.body.results.length, 1)
      assert.equal(first.body.page_info.has_next_page, true)
      const cursor = first.body.page_info.end_cursor
      assert.ok(cursor)
      const second = await getTrending({ limit: 1, min_score: 3, after: cursor }, true)
      assert.notEqual(second.body.results[0]?.id, first.body.results[0]?.id)
      assert.equal(second.body.results.length, 1)
      const ownedSecondary = await getTrending(
        { limit: 1, min_score: 3, after: boundaryAfter(secondaryId) },
        true,
      )
      assert.equal(ownedSecondary.body.results[0]?.id, secondaryId)
      assert.ok(![first.body.results[0]?.id, second.body.results[0]?.id].includes(hiddenId))
    }),
  )
}
