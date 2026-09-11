import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'

test.describe('Topic settings — non-admin boundary', () => {
  let topicId: string
  let sourceTopicId: string

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const topic = await insertTestTopic(
      `Settings Boundary Topic ${suffix}`,
      `settings-boundary-topic-${suffix}`,
    )
    topicId = topic.id

    const source = await insertTestTopic(
      `Settings Boundary Source ${suffix}`,
      `settings-boundary-source-${suffix}`,
      'rss_feed',
    )
    sourceTopicId = source.id
  })

  test('non-admin hitting /topic/<id>/settings/merge is redirected to /feed/news', async ({
    page,
  }) => {
    await withCleanUser(page)
    await navigateTo(page, `/topic/${topicId}/settings/merge`)
    await expect(page).toHaveURL('/feed/news')
  })

  test('non-admin hitting /source/<id>/settings/source is redirected to /feed/news', async ({
    page,
  }) => {
    await withCleanUser(page)
    await navigateTo(page, `/source/${sourceTopicId}/settings/source`)
    await expect(page).toHaveURL('/feed/news')
  })

  test('non-admin does not see the settings tab on topic detail', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/topic/${topicId}`)
    await expect(page.getByTestId('topic-detail-tab-settings')).not.toBeAttached()
  })
})
