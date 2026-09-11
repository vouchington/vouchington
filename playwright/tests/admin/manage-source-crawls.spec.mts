import { test, expect } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { insertTestRssFeedCrawl } from '../../helpers/insert-test-rss-feed-crawl.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Admin Source Crawl Pages', () => {
  test.use({ storageState: AUTH_STATE })
  test.describe.configure({ mode: 'serial' })

  let sourceTopicId: string
  let crawlId: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Source Crawl Test Topic ${suffix}`,
      `source-crawl-test-${suffix}`,
      'rss_feed',
    )
    sourceTopicId = topic.id
    const feed = await insertTestRssFeed(sourceTopicId, `source-crawl-${suffix}`)
    const crawl = await insertTestRssFeedCrawl(feed.id, {
      responseCode: 200,
      feedData: { items: [{ id: 'item-1', title: 'Test Item', url: 'https://example.com/1' }] },
    })
    crawlId = crawl.id
  })

  test('should show crawl history section on source settings page', async ({ page }) => {
    await navigateTo(page, `/source/${sourceTopicId}/settings/source`)

    await expect(page.getByTestId('crawl-history-section')).toBeVisible()
    await expect(page.getByTestId('crawl-history-view-all-crawls')).toBeVisible()
    await expect(page.getByTestId('crawl-history-view-ingested-items')).toBeVisible()
  })

  test('should show source crawls list page', async ({ page }) => {
    await navigateTo(page, `/source/${sourceTopicId}/crawls`)

    await expect(page.getByTestId('source-crawls-heading')).toBeVisible()
    await expect(page.getByTestId('source-crawls-view-items')).toBeVisible()
    await expect(page.getByTestId('source-crawls-table')).toBeVisible()
    await expect(page.getByTestId('source-crawl-row').first()).toBeVisible()
  })

  test('should show source crawl detail page', async ({ page }) => {
    await navigateTo(page, `/source/${sourceTopicId}/crawls/${crawlId}`)

    await expect(page.getByTestId('source-crawl-detail-heading')).toBeVisible()
    await expect(page.getByTestId('source-crawl-outcome-banner')).toBeVisible()
    await expect(page.getByTestId('source-crawl-detail-view-items')).toBeVisible()
    await expect(page.getByTestId('source-crawl-feed-items')).toBeVisible()
  })
})
