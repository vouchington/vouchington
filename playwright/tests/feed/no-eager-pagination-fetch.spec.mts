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
import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { forceMainScrollableBeforeHydration } from '../../helpers/scroll-to-load-more.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertTestRssFeedItem } from '../../../backend/test-helpers/entities/rss-feed-items.mts'
import { getRssFeedItemFeedIds } from '../../../backend/services/feeds/rss-feed-items/get-ids.mts'
import { followRssFeed } from '../../../backend/test-helpers/entities/test-entities.mts'
import {
  createTestTopic,
  createTestUser,
  insertTestUrl,
} from '../../../backend/test-helpers/index.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

// Must exceed FEED_PAGE_LIMIT (25) to ensure has_next_page is true
const ITEM_COUNT = 30

test.describe('InfiniteScroll — no eager second-page fetch on initial load', () => {
  let testUserId: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const testUser = await createTestUser({ username: `pw-scroll-feed-user-${suffix}` })
    if (!testUser) throw new Error('createTestUser returned null')
    testUserId = testUser.id

    const topic = await createTestTopic({
      user: testUser,
      name: `PW Scroll Feed Topic ${suffix}`,
      slug: `pw-scroll-feed-topic-${suffix}`,
      topic_type: 'topic',
    })

    const feed = await insertTestRssFeed(topic.id, `scroll-feed-${suffix}`)
    await followRssFeed(testUser, feed.id)

    // Insert ITEM_COUNT items so the feed response has has_next_page = true
    for (let i = 0; i < ITEM_COUNT; i++) {
      const pathname = `/scroll-article-${suffix}-${i}.html`
      const url = `https://${feed.hostname}${pathname}`
      const urlId = await insertTestUrl({ url, hostnameId: feed.hostnameId })

      const guid = `pw-scroll-item-${suffix}-${i}`
      const contentSha256 = createHash('sha256').update(guid).digest()
      await insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid,
        itemData: {
          title: `Scroll Test Article ${i} — ${suffix}`,
          link: url,
          description: `Test article ${i} for no-eager-fetch regression`,
          pub_date: new Date(Date.now() - i * 60_000).toISOString(),
        },
        contentSha256,
      })
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
    // Sentinel being present confirms has_next_page=true (30 items > FEED_PAGE_LIMIT)
    await expect(page.getByTestId('infinite-scroll-sentinel')).toBeVisible()
    // requestIdleCallback fires after all pending microtasks and RAF callbacks
    await waitForBelowFoldHydration(page)

    expect(
      paginatedRequests,
      `Expected no second-page fetches on initial load, but got:\n${paginatedRequests.join('\n')}`,
    ).toHaveLength(0)
  })
})
