import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { navigateTo, randomSuffix, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'

test.describe('Source actions', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows crawl action and lets an owner cancel feed deletion', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Source actions ${suffix}`,
      `source-actions-${suffix}`,
      'rss_feed',
    )
    await insertTestRssFeed(topic.id, `source-actions-${suffix}`)

    await navigateTo(page, `/source/${topic.id}/settings/source`)
    const crawl = page.getByTestId('feed-actions-section-trigger-crawl')
    await crawl.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await expect(crawl).toBeVisible()

    await page.getByTestId('feed-delete').click()
    const cancel = page.getByTestId('feed-actions-section-cancel')
    await expect(cancel).toBeVisible()
    await cancel.click()
    await expect(page.getByTestId('feed-delete')).toBeVisible()
  })
})
