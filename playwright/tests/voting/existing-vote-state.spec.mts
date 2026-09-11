import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { voteChoice, voteTrigger } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

// After voting on a news item, the user's existing vote must still highlight after reload.
// The /api/v1/rss-feed-items list response includes an `election_votes` sidecar for logged-in
// users, and the news client components must thread it down to ScoreVote so the semantic choice
// remains selected on the next page load.
test.describe('Existing vote state after reload', () => {
  let contributorId: string

  test.beforeAll(async () => {
    contributorId = requireTestValue(
      await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      'Failed to create existing vote state contributor',
    ).id
  })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, contributorId)
  })

  test('news card keeps its semantic vouch choice after reload', async ({ page }) => {
    await navigateTo(page, '/news')

    const trigger = voteTrigger(page, 'news-item-vote').first()
    await expect(trigger).toBeVisible()
    const votePromise = page.waitForResponse(
      response =>
        /\/api\/v1\/rss-feed-items\/[^/]+\/vote/.test(response.url()) && response.status() < 400,
    )
    await trigger.click()
    await voteChoice(page, 'news-item-vote', 'vouch').click()
    await votePromise

    await navigateTo(page, '/news')

    await expect(voteTrigger(page, 'news-item-vote').first()).toContainText('Vouch')
  })
})
