import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'

test.describe('Add Source modal', () => {
  test.use({ storageState: AUTH_STATE })

  test('add-source-button is visible and opens modal on /podcasts', async ({ page }) => {
    await navigateTo(page, '/podcasts')

    const addBtn = page.getByTestId('add-source-button')
    await expect(addBtn).toBeVisible()

    await addBtn.click()

    await expect(page.getByTestId('add-source-dialog-title')).toBeVisible()
    await expect(page.getByTestId('add-source-form-url')).toBeVisible()
    await expect(page.getByTestId('add-source-form-submit')).toBeVisible()
  })

  test('submitting the add-source form shows a success toast and redirects to the source page', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const topicSlug = `mock-test-source-${suffix}`
    const sourceTopic = await insertTestTopic(`Mock Test Source ${suffix}`, topicSlug, 'rss_feed')
    const rssFeed = await insertTestRssFeed(sourceTopic.id, `mock-test-source-${suffix}`)

    await page.route('**/api/v1/rss-feeds', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            rss_feed_id: rssFeed.id,
            topic_id: sourceTopic.id,
            topic_slug: topicSlug,
          }),
        })
      } else {
        await route.continue()
      }
    })

    await navigateTo(page, '/podcasts')
    await page.getByTestId('add-source-button').click()
    await expect(page.getByTestId('add-source-dialog-title')).toBeVisible()

    await page.getByTestId('add-source-form-url').pressSequentially('https://example.com/feed.rss')
    await page.getByTestId('add-source-form-submit').click()

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Source added successfully',
    )
    await expect(page).toHaveURL(`/source/${topicSlug}/latest`)
    await expect(page.getByTestId('topic-detail-header')).toContainText(
      `Mock Test Source ${suffix}`,
    )
    await expect(page.getByTestId('follow-source-button')).toBeVisible()
  })
})
