import { describe, expect, it } from 'vitest'

import * as clientRoutes from '@/lib/api/client'
import { createTestRssFeedItemWithUrl } from '../../../../backend/test-helpers/index.mts'
import { installClientContentRouteHarness } from '../../../test-helpers/client-content-route-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

// published_at is a generated column defaulting to the item's insertion instant. The
// 'no options' test below asserts this item appears in the globally recency-ordered,
// default-limit-10 feed with no scoping filter — on a dirty, parallel database, other
// integration-test files concurrently inserting real-time-stamped rss_feed_items could
// otherwise push this fixture out of the top 10 between beforeAll and the assertion.
// Pin it to a bounded near-future window (not a permanent far-future date) so it sorts
// ahead of same-instant inserts from concurrent test files for the life of this test run,
// then decays into ordinary history a few minutes later instead of permanently dominating
// recency-ordered queries against the shared, never-cleaned database.
const RSS_FEED_ITEM_FIXTURE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

describe('client-content-routes', () => {
  let nonMatchingRssFeedItemId = ''

  const harness = installClientContentRouteHarness({
    unset,
    rssFeedItemOptions: () => ({
      createdAt: new Date(Date.now() + RSS_FEED_ITEM_FIXTURE_WINDOW_MS),
    }),
    // A second item with an unrelated title/random suffix under the same feed, pinned to the
    // same bounded future window (a moment earlier) so it is also among the most-recent items
    // in this feed's global recency ordering. If `q` were dropped or ignored, an unfiltered
    // top-5 would legitimately include this item too, so asserting its exclusion below is what
    // actually detects a broken search parameter rather than the item merely aging out of the
    // page on a dirty database.
    afterPrimaryItem: async () => {
      const nonMatchingItem = await createTestRssFeedItemWithUrl(harness.rssFeedId, {
        createdAt: new Date(Date.now() + RSS_FEED_ITEM_FIXTURE_WINDOW_MS - 1000),
      })
      nonMatchingRssFeedItemId = nonMatchingItem.id
    },
  })

  describe('rss-feed-items client routes', () => {
    it('fetchRssFeedItems returns 200 with no options', async () => {
      // No filters are applied when called with no options: the query is the most-recent
      // rss_feed_items globally (default limit 10), so the item seeded in beforeAll — pinned
      // to a bounded near-future published_at — is present for the life of this test run
      // regardless of what other test files concurrently insert. Any nonempty response with
      // page_info would otherwise satisfy this on a dirty, parallel database even if the
      // client hit the wrong endpoint — assert the seeded item's id is actually present, and
      // that its entity map entry was hydrated, to verify the contract.
      const result = await harness.withClientRuntime(
        () => clientRoutes.fetchRssFeedItems(),
        harness.userCookieHeader,
      )
      expect(result.results.length).toBeGreaterThanOrEqual(1)
      expect(result.page_info).toBeDefined()
      const resultIds = result.results.map(item => item.id)
      expect(resultIds).toContain(harness.rssFeedItemId)
      expect(result.rss_feed_items[harness.rssFeedItemId]).toBeDefined()
    })

    it('fetchRssFeedItems returns 200 with search query', async () => {
      // createTestRssFeedItemWithUrl titles items "Test Item <random>"; the random
      // suffix is unique to this fixture and indexed into rss_feed_items.search_vector,
      // so it is a token a `q` search can match on without also matching other items.
      // If `q` were dropped or ignored, the unfiltered feed would still return an
      // array with page_info (it also contains nonMatchingRssFeedItemId), so assert
      // on which items come back rather than only the response shape.
      const rssFeedItemSearchToken = harness.rssFeedItemTitle.split(' ').at(-1)!
      const result = await harness.withClientRuntime(
        () => clientRoutes.fetchRssFeedItems({ q: rssFeedItemSearchToken, limit: 5 }),
        harness.userCookieHeader,
      )
      const resultIds = result.results.map(item => item.id)
      expect(resultIds).toContain(harness.rssFeedItemId)
      expect(resultIds).not.toContain(nonMatchingRssFeedItemId)
    })

    it('shareRssFeedItemWithFollowers returns 200', async () => {
      const result = await harness.withClientRuntime(
        () => clientRoutes.shareRssFeedItemWithFollowers(harness.rssFeedItemId),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    })

    it('sendRssFeedItemToFollowers with all_followers returns 200', async () => {
      const result = await harness.withClientRuntime(
        () =>
          clientRoutes.sendRssFeedItemToFollowers(harness.rssFeedItemId, {
            audience: 'all_followers',
          }),
        harness.adminCookieHeader,
      )
      expect(result).toMatchObject({ status: 'accepted', distribution_id: expect.any(String) })
    })

    it('sendRssFeedItemToFollowers with selected_followers reaches the endpoint', async () => {
      await expect(
        harness.withClientRuntime(
          () =>
            clientRoutes.sendRssFeedItemToFollowers(harness.rssFeedItemId, {
              audience: 'selected_followers',
              recipient_user_ids: [harness.userId],
            }),
          harness.adminCookieHeader,
        ),
      ).rejects.toMatchObject({ name: 'ApiError' })
    })
  })
})
