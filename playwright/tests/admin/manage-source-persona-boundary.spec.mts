import { test, expect } from '../../helpers/test.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { insertTestRssFeed } from '../../helpers/insert-test-rss-feed.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { createSiteModeratorUser, loginAsUser } from '../../helpers/auth.mts'

// Verify that site moderators have no admin controls on source (rss_feed) topic pages.
// Authorization: source management is admin-only (backend/services/rss-feeds/authorization.mts).
test.describe('Source settings tab — persona boundary', () => {
  let moderatorId: string
  let sourceTopicId: string
  let sourceTopicUrlSlug: string

  test.beforeAll(async () => {
    const moderator = await createSiteModeratorUser()
    moderatorId = moderator.id

    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `SM Boundary Source ${suffix}`,
      `sm-boundary-source-${suffix}`,
      'rss_feed',
    )
    sourceTopicId = topic.id
    sourceTopicUrlSlug = topic.urlSlug
    await insertTestRssFeed(sourceTopicId, suffix)
  })

  test('settings tab is hidden for site moderator on source page', async ({ page }) => {
    await loginAsUser(page, moderatorId)
    await navigateTo(page, `/${sourceTopicUrlSlug}/${sourceTopicId}`)

    // Confirm the source page loaded before asserting the negative.
    await expect(page.getByTestId('topic-detail-header')).toBeVisible()
    await expect(page.getByTestId('topic-detail-tab-settings')).toBeHidden()
  })
})
