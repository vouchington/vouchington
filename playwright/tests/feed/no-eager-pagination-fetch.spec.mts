/**
 * Regression test: InfiniteScroll must not fetch the second page on initial
 * page load before the user has scrolled.
 *
 * Previously, the IntersectionObserver fired immediately when the sentinel was
 * in the viewport on mount (e.g. story clustering reduces 25 raw items to ~6-10
 * visible clusters, leaving the sentinel just barely on-screen). The fix gates
 * the IO callback behind a one-shot scroll listener: onLoadMore is only called
 * after the user has scrolled at least once.
 */
import { createHash } from 'node:crypto'
import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import {
  forceMainScrollableBeforeHydration,
  navigateTo,
  randomSuffix,
  waitForBelowFoldHydration,
} from 'vouchington-tooling/playwright'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import { getRssFeedItemFeedIds } from '../../../backend/services/feeds/rss-feed-items/get-ids.mts'
import { followRssFeed } from '../../../backend/test-helpers/entities/test-entities.mts'
import {
  createTestTopic,
  createTestUser,
  insertTestUrl,
} from '../../../backend/test-helpers/index.mts'

// The feed endpoint caps each followed source independently. Keep this fixture
// above the page limit even after that per-source cap is applied.
const SOURCE_COUNT = 4
const ITEMS_PER_SOURCE = 8

test.describe('InfiniteScroll — no eager second-page fetch on initial load', () => {
  let testUserId: string

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    const testUser = await createTestUser({ username: `pw-scroll-feed-user-${suffix}` })
    if (!testUser) throw new Error('createTestUser returned null')
    testUserId = testUser.id

    for (let sourceIndex = 0; sourceIndex < SOURCE_COUNT; sourceIndex++) {
      const topic = await createTestTopic({
        user: testUser,
        name: `PW Scroll Feed Topic ${sourceIndex} ${suffix}`,
        slug: `pw-scroll-feed-topic-${sourceIndex}-${suffix}`,
        topic_type: 'topic',
      })
      const feed = await insertTestRssFeed(topic.id, `scroll-feed-${sourceIndex}-${suffix}`)
      await followRssFeed(testUser, feed.id)

      // Each source supplies exactly its current per-source cap; together the
      // four followed sources still leave an extra row beyond FEED_PAGE_LIMIT.
      for (let itemIndex = 0; itemIndex < ITEMS_PER_SOURCE; itemIndex++) {
        const itemKey = `${sourceIndex}-${itemIndex}`
        const pathname = `/scroll-article-${suffix}-${itemKey}.html`
        const url = `https://${feed.hostname}${pathname}`
        const urlId = await insertTestUrl({ url, hostnameId: feed.hostnameId })

        const guid = `pw-scroll-item-${suffix}-${itemKey}`
        const contentSha256 = createHash('sha256').update(guid).digest()
        await insertTestRssFeedItem({
          rssFeedId: feed.id,
          urlId,
          guid,
          itemData: {
            title: `Scroll Test Article ${itemKey} — ${suffix}`,
            link: url,
            description: 'Test article for no-eager-fetch regression',
            pub_date: new Date(Date.now() - itemIndex * 60_000).toISOString(),
          },
          contentSha256,
        })
      }
    }

    const seededPage = await getRssFeedItemFeedIds(testUser, {
      feed_type: 'follow_rss_feeds',
      limit: 25,
    })
    expect(seededPage.page_info.has_next_page).toBe(true)
    expect(seededPage.page_info.end_cursor).not.toBeNull()
  })

  test('does not fetch the second page on initial navigation', async ({ page }) => {
    await forceMainScrollableBeforeHydration(page)

    await loginAsUser(page, testUserId)
    // Navigate to an unrelated page first so the interceptor below only captures
    // requests triggered by the explicit navigation under test.
    await navigateTo(page, '/article/keyboard-shortcuts')

    const paginatedRequests: string[] = []
    await page.route('**/api/v1/feeds/rss_feed_items/**', route => {
      const url = new URL(route.request().url())
      if (
        url.pathname === '/api/v1/feeds/rss_feed_items/follow_rss_feeds' &&
        url.searchParams.has('after')
      ) {
        paginatedRequests.push(url.toString())
      }
      return route.continue()
    })

    await navigateTo(page, '/feed/news/sources')

    await expect(page.getByTestId('news-item-card').first()).toBeVisible()
    // Sentinel being present confirms has_next_page=true (32 bounded source
    // items > FEED_PAGE_LIMIT).
    await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()
    // requestIdleCallback fires after all pending microtasks and RAF callbacks
    await waitForBelowFoldHydration(page)

    expect(
      paginatedRequests,
      `Expected no second-page fetches on initial load, but got:\n${paginatedRequests.join('\n')}`,
    ).toHaveLength(0)
  })
})
