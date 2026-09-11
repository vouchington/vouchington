import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { insertTestTopic } from '../../helpers/insert-test-topic.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import { chooseVote, voteTrigger } from '../../helpers/semantic-vote.mts'
import {
  CONTRIBUTING_USER_AGE_MS,
  connectTestOAuthAccount,
  createTestUserWithAge,
  getLatestEmailAddressLoginTokenHash,
  insertTestOAuthAccount,
} from '../../../backend/test-helpers/index.mts'

test.describe('Email verification recovery', () => {
  test('OAuth user without an email verifies one and manually retries a vote', async ({ page }) => {
    const unique = randomSuffix()
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      noEmail: true,
      username: `oauth-no-email-${unique}`,
    })
    const oauthUser = requireTestValue(user, 'Failed to create OAuth user without an email address')

    const providerUserId = `oauth-no-email-${unique}`
    await insertTestOAuthAccount('x', providerUserId)
    await connectTestOAuthAccount('x', oauthUser.id, providerUserId)

    const topic = await insertTestTopic(
      `Email Recovery Vote ${unique}`,
      `email-recovery-vote-${unique}`,
    )
    const emailAddress = `tests+oauth-recovery-${unique}@voucha.ai`

    await loginAsUser(page, oauthUser.id)
    await navigateTo(page, `/topic/${topic.id}/discussions`)

    const voteButton = voteTrigger(page, 'topic-vouch-disavow-vote')
    await expect(voteButton).toBeVisible()
    await chooseVote(page, 'topic-vouch-disavow-vote', 'vouch')

    const recoveryDialog = page.getByRole('dialog', { name: 'Verify your email' })
    await expect(recoveryDialog).toBeVisible()
    await expect(voteButton).toBeVisible()

    await recoveryDialog.getByLabel('New email address').pressSequentially(emailAddress)
    const requestCompleted = page.waitForResponse(
      response =>
        response.url().endsWith('/api/v1/my/email-addresses') &&
        response.request().method() === 'POST',
    )
    await recoveryDialog.getByRole('button', { name: 'Send verification code' }).click()
    await requestCompleted

    const verificationToken = requireTestValue(
      await getLatestEmailAddressLoginTokenHash(emailAddress),
      'Email verification token was not created',
    )

    const verificationCompleted = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/my/email-addresses/') &&
        response.url().endsWith('/verifications') &&
        response.request().method() === 'POST',
    )
    await recoveryDialog.getByLabel('Verification code').pressSequentially(verificationToken)
    await verificationCompleted

    await expect(recoveryDialog).toHaveCount(0)
    await expect(page.locator('[data-sonner-toast]')).toContainText(
      'Email verified. Try your action again.',
    )
    await expect(voteButton).toContainText('Vote')

    await chooseVote(page, 'topic-vouch-disavow-vote', 'vouch')
    await expect(voteButton).toContainText('Vouch')
  })
})
