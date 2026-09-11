import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { voteTrigger } from '../../helpers/semantic-vote.mts'
import { write } from '../../../backend/data-stores/psql/clients.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

test.describe('Referral Programs Page', () => {
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create referral programs contributor')
    contributorId = contributor.id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('should display referral programs list page', async ({ page }) => {
    await navigateTo(page, '/referral-programs')

    await expect(page.getByTestId('page-header-title')).toContainText('Referral Programs')
    await expect(page.getByTestId('list-filters-search-input')).toBeVisible()
  })

  test('should not show vote buttons for anonymous viewers', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/referral-programs')
    await expect(voteTrigger(page, 'score-vote')).toHaveCount(0)
  })

  test('should show vote buttons and prior vote state for authenticated users', async ({
    page,
  }) => {
    const suffix = randomSuffix()
    const { id: topicId } = await insertTestTopic(
      `Playwright Referral Test ${suffix}`,
      `playwright-referral-test-${suffix}`,
      'referral_program',
    )

    // Insert a semantic Like (+1) for the test user on this topic.
    // topic_votes is an append-only log table with no unique constraint on (user_id, topic_id)
    await write(
      `INSERT INTO topic_votes (user_id, topic_id, score, score_is_semantic)
       VALUES ($1, $2, 1, TRUE)`,
      [contributorId, topicId],
    )

    await navigateTo(page, `/referral-programs?q=Playwright+Referral+Test+${suffix}`)

    const trigger = voteTrigger(page, 'score-vote').first()
    await expect(trigger).toBeVisible()
    await expect(trigger).toContainText('Like')
  })
})
