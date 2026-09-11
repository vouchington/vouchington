import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'

/**
 * Regression test: loading /news must not fire individual
 * GET /api/v1/bookmarks/rss_feed/:id requests.
 *
 * Previously each NewsItemCard independently fetched bookmark status
 * for its source RSS feed, causing N requests per page load. The fix
 * batches these into the existing /api/v1/rss-feed-items response via
 * the `rss_feed_bookmarks` field.
 */
test.describe('News page RSS feed bookmark batching', () => {
  test.use({ storageState: AUTH_STATE })

  test('does not fire individual /api/v1/bookmarks/rss_feed/ requests when logged in', async ({
    page,
  }) => {
    const individualBookmarkRequests: string[] = []

    // Intercept before navigation so we catch everything
    await page.route('**/api/v1/bookmarks/rss_feed/**', route => {
      individualBookmarkRequests.push(route.request().url())
      return route.continue()
    })

    await navigateTo(page, '/news')

    expect(
      individualBookmarkRequests,
      `Expected zero individual /api/v1/bookmarks/rss_feed/ calls but got:\n${individualBookmarkRequests.join('\n')}`,
    ).toHaveLength(0)
  })

  test('/news keeps source subscription state batched with no card subscribe buttons', async ({
    page,
  }) => {
    await navigateTo(page, '/news')

    const apiBody = (await page.evaluate(async () => {
      const response = await fetch('/api/v1/rss-feed-items')
      return response.json() as Promise<{ rss_feed_bookmarks?: unknown }>
    })) as { rss_feed_bookmarks?: unknown }
    expect(apiBody.rss_feed_bookmarks).toBeDefined()

    const subscribeButtons = page.getByTestId('source-subscribe-news')
    await expect(subscribeButtons).toHaveCount(0)
  })
})
