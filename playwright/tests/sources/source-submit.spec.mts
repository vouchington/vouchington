import { test, expect, protectPlaywrightHookTimeouts } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { completeSourceImport, failSourceImport } from '../../helpers/complete-source-import.mts'
import { softDeleteTopic } from '../../../backend/test-helpers/entities/topics/deletion.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

test.describe('Submit a Source — single-URL redirect', () => {
  let sourceTopicSlug: string
  let feedUrl: string
  let feedId: string

  test.beforeAll(async () => {
    protectPlaywrightHookTimeouts(test.info())
    const suffix = randomSuffix()
    sourceTopicSlug = `test-rss-source-mock-${suffix}`
    const topic = await insertTestTopic(`RSS Source ${suffix}`, sourceTopicSlug, 'rss_feed')
    const feed = await insertTestRssFeed(topic.id, `source-submit-${suffix}`)
    feedId = feed.id
    feedUrl = `https://${feed.hostname}/feed.xml`
  })

  test('submitting one RSS feed URL redirects to /source/<slug>', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/sources')

    await page.getByTestId('sources-submit-source-button').click()
    await expect(page.getByTestId('submit-source-dialog-title')).toBeVisible()

    await page.getByTestId('create-source-form-urls').pressSequentially(feedUrl)
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/rss-feeds',
    )
    await page.getByTestId('create-source-form-submit').click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const result = (await response.json()) as { import: { id: string } }
    await expect(page.getByTestId('create-source-form-submit')).toBeDisabled()
    await completeSourceImport(result.import.id, feedId)

    // rss_feed topic roots redirect to /latest — assert the stable final URL
    await expect(page).toHaveURL(`/source/${sourceTopicSlug}/latest`)
  })

  test('completed source without an active topic still reports success', async ({ page }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Inactive RSS Source ${suffix}`,
      `inactive-source-${suffix}`,
      'rss_feed',
    )
    const feed = await insertTestRssFeed(topic.id, `inactive-source-${suffix}`)
    await softDeleteTopic(topic.id, TEST_USER_ID)

    await withCleanUser(page)
    await navigateTo(page, '/sources')
    await page.getByTestId('sources-submit-source-button').click()
    await page
      .getByTestId('create-source-form-urls')
      .pressSequentially(`https://${feed.hostname}/feed.xml`)
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/rss-feeds',
    )
    await page.getByTestId('create-source-form-submit').click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const result = (await response.json()) as { import: { id: string } }
    await completeSourceImport(result.import.id, feed.id)

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Source added successfully',
    )
    await expect(page).toHaveURL('/sources')
    await expect(page.getByTestId('submit-source-dialog-title')).toBeHidden()
  })

  test('terminal feed timeout shows localized error without navigating', async ({ page }) => {
    const feedUrl = `https://timeout-source-${randomSuffix()}.example.com/feed.xml`
    await withCleanUser(page)
    await navigateTo(page, '/sources')
    await page.getByTestId('sources-submit-source-button').click()
    await page.getByTestId('create-source-form-urls').pressSequentially(feedUrl)
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/rss-feeds',
    )
    await page.getByTestId('create-source-form-submit').click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const result = (await response.json()) as { import: { id: string } }
    await failSourceImport(result.import.id, 'RSS feed processing exceeded its time budget')

    await expect(page.getByText('The request timed out. Please try again.')).toBeVisible()
    await expect(page).toHaveURL('/sources')
    await expect(page.getByTestId('submit-source-dialog-title')).toBeVisible()
  })
})
