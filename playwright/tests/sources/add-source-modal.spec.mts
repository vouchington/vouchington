import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { completeSourceImport, failSourceImport } from '../../helpers/complete-source-import.mts'
import { softDeleteTopic } from '../../../backend/test-helpers/entities/topics/deletion.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'

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

    await navigateTo(page, '/podcasts')
    await page.getByTestId('add-source-button').click()
    await expect(page.getByTestId('add-source-dialog-title')).toBeVisible()

    await page
      .getByTestId('add-source-form-url')
      .pressSequentially(`https://${rssFeed.hostname}/feed.xml`)
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/rss-feeds',
    )
    await page.getByTestId('add-source-form-submit').click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const result = (await response.json()) as { import: { id: string } }
    await expect(page.getByTestId('add-source-form-submit')).toBeDisabled()
    await completeSourceImport(result.import.id, rssFeed.id)

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Source added successfully',
    )
    await expect(page).toHaveURL(`/source/${topicSlug}/latest`)
    await expect(page.getByTestId('topic-detail-header')).toContainText(
      `Mock Test Source ${suffix}`,
    )
    await expect(page.getByTestId('follow-source-button')).toBeVisible()
  })

  test('completed feed without an active topic reports success on the current page', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Inactive Podcast Source ${suffix}`,
      `inactive-podcast-${suffix}`,
      'rss_feed',
    )
    const feed = await insertTestRssFeed(topic.id, `inactive-podcast-${suffix}`)
    await softDeleteTopic(topic.id, TEST_USER_ID)

    await navigateTo(page, '/podcasts')
    await page.getByTestId('add-source-button').click()
    await page
      .getByTestId('add-source-form-url')
      .pressSequentially(`https://${feed.hostname}/feed.xml`)
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/rss-feeds',
    )
    await page.getByTestId('add-source-form-submit').click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const result = (await response.json()) as { import: { id: string } }
    await completeSourceImport(result.import.id, feed.id)

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Source added successfully',
    )
    await expect(page).toHaveURL('/podcasts')
    await expect(page.getByTestId('add-source-dialog-title')).toBeHidden()
  })

  test('invalid feed content reports a localized expected error', async ({ page }) => {
    const feedUrl = `https://invalid-podcast-${randomSuffix()}.example.com/feed.xml`
    await navigateTo(page, '/podcasts')
    await page.getByTestId('add-source-button').click()
    await page.getByTestId('add-source-form-url').pressSequentially(feedUrl)
    const accepted = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/rss-feeds',
    )
    await page.getByTestId('add-source-form-submit').click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const result = (await response.json()) as { import: { id: string } }
    await failSourceImport(
      result.import.id,
      'RSS feed URL must return a valid RSS, Atom, or JSON feed',
    )

    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText(
      'The request was invalid. Please try again.',
    )
    await expect(page).toHaveURL('/podcasts')
    await expect(page.getByTestId('add-source-dialog-title')).toBeVisible()
  })
})
