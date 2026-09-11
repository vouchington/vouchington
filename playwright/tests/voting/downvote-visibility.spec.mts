import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { voteTrigger } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '../../../backend/test-helpers/index.mts'

// Uses seed data:
// - Discussion: '019c64e6-f720-7001-a001-000000000001'
// Downvote count visibility applies to posts (UGC) only: all signed-in users can cast downvotes,
// but only paid members and admins see downvote counts in post API responses.
// Non-UGC content (topics, hostnames, RSS feed items) shows downvote counts to all users.

const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'

test.describe('Downvote Visibility by Membership Tier', () => {
  test.use({ storageState: AUTH_STATE })
  let contributorId: string

  test.beforeAll(async () => {
    const contributor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    if (!contributor) throw new Error('Failed to create downvote visibility contributor')
    contributorId = contributor.id
  })

  test.describe('signed-out user', () => {
    // Clear auth cookies (not storageState) so the inherited cookie-consent
    // localStorage stays set and the consent banner doesn't reappear.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('sees intent-aware vote links pointing to /login', async ({ page }) => {
      await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

      const signedOutLinks = page.getByTestId('score-vote-sign-in')
      expect(await signedOutLinks.count()).toBeGreaterThanOrEqual(1)
      await expect(signedOutLinks.first()).toBeVisible()

      await expect(voteTrigger(page, 'score-vote')).toHaveCount(0)
    })
  })

  test.describe('signed-in user', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsUser(page, contributorId)
    })

    test('sees the semantic sentiment control on posts', async ({ page }) => {
      await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

      await expect(voteTrigger(page, 'score-vote').first()).toBeVisible()
    })

    test('regular user sees an enabled semantic vote control', async ({ page }) => {
      await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

      const trigger = voteTrigger(page, 'score-vote').first()
      await expect(trigger).toBeVisible()
      await expect(trigger).toBeEnabled()
    })
  })
})
