import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'

test.describe('Submit a Source — single-URL redirect', () => {
  let mockTopicSlug: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    mockTopicSlug = `test-rss-source-mock-${suffix}`
    await insertTestTopic(`Mock RSS Source ${suffix}`, mockTopicSlug, 'rss_feed')
  })

  test('submitting one RSS feed URL redirects to /source/<slug>', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/sources')

    await page.route('**/api/v1/rss-feeds', async route => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'created',
          rss_feed_id: '01900000-0000-7000-8000-000000000099',
          topic_id: '01900000-0000-7000-8000-000000000100',
          topic_slug: mockTopicSlug,
        }),
      })
    })

    await page.getByTestId('sources-submit-source-button').click()
    await expect(page.getByTestId('submit-source-dialog-title')).toBeVisible()

    await page
      .getByTestId('create-source-form-urls')
      .pressSequentially('https://example.com/feed.xml')
    await page.getByTestId('create-source-form-submit').click()

    // rss_feed topic roots redirect to /latest — assert the stable final URL
    await expect(page).toHaveURL(`/source/${mockTopicSlug}/latest`)
  })
})
