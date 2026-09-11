import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'

let topicId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()
  const topic = await insertTestTopic(`Settings Boundary ${suffix}`, `settings-boundary-${suffix}`)
  topicId = topic.id
})

test.describe('Topic settings boundary — no-role signed-in user', () => {
  // requireAdmin() redirects to '/', and the home page further redirects logged-in users to '/feed/news'.
  test('redirects from /topic/:id/settings to /feed/news', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/topic/${topicId}/settings`)
    await expect(page).toHaveURL('/feed/news')
  })

  test('redirects from /topic/:id/settings/merge to /feed/news', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/topic/${topicId}/settings/merge`)
    await expect(page).toHaveURL('/feed/news')
  })

  test('hides the settings tab on the topic detail page', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, `/topic/${topicId}`)
    await expect(page.getByTestId('topic-detail-tab-settings')).toHaveCount(0)
  })
})
