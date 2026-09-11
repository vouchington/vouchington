import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Recently Viewed Sources', () => {
  test('visiting a source detail page records the view and it appears on /my/news-sources/viewed', async ({
    page,
  }) => {
    await withCleanUser(page)
    const suffix = randomSuffix()
    const slug = `viewed-source-${suffix}`
    const { id: topicId } = await insertTestTopic(`Viewed Test Feed ${suffix}`, slug, 'rss_feed')
    await insertTestRssFeed(topicId, suffix)

    const viewsResponse = page.waitForResponse(
      r =>
        r.url().includes('/api/v1/rss-feeds/') &&
        r.url().endsWith('/views') &&
        r.request().method() === 'POST',
    )
    await navigateTo(page, `/source/${slug}`)
    await viewsResponse

    await navigateTo(page, '/my/news-sources/viewed')
    await expect(page.getByTestId('my-news-sources-viewed-page')).toBeVisible()
    await expect(page.getByText(`Test Feed ${suffix}`)).toBeVisible()
  })
})
