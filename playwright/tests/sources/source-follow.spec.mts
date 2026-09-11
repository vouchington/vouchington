import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Source follow toggle', () => {
  let topicId: string

  test.beforeAll(async () => {
    const unique = randomSuffix()
    const topic = await insertTestTopic(
      `Follow Toggle Test ${unique}`,
      `follow-toggle-src-${unique}`,
      'rss_feed',
    )
    topicId = topic.id
    await insertTestRssFeed(topic.id, `follow-toggle-${unique}`)
  })

  test('Follow Source button on source detail page toggles follow state', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/source/${topicId}/posts`)

    const followSourceBtn = page.getByTestId('follow-source-button')
    await expect(followSourceBtn).toBeVisible()
    await expect(followSourceBtn).toHaveAttribute('aria-pressed', 'false')

    const followResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/bookmarks/') &&
        response.url().includes('/follow') &&
        response.status() < 400,
    )
    await followSourceBtn.click()
    await followResponse
    await expect(followSourceBtn).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(followSourceBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('Follow Topic button on source detail page toggles follow state', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/source/${topicId}/posts`)

    const followTopicBtn = page.getByTestId('follow-topic-button')
    await expect(followTopicBtn).toBeVisible()
    await expect(followTopicBtn).toHaveAttribute('aria-pressed', 'false')

    const followResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/bookmarks/') &&
        response.url().includes('/follow') &&
        response.status() < 400,
    )
    await followTopicBtn.click()
    await followResponse
    await expect(followTopicBtn).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(followTopicBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
