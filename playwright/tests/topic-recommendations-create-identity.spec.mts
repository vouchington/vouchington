import { test, expect } from '../helpers/test.mts'
import { loginAsUser } from '../helpers/auth.mts'
import { navigateTo } from '../helpers/navigate-to.mts'
import { randomSuffix } from '../helpers/random-id.mts'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '../../backend/test-helpers/index.mts'

let userId: string

test.beforeEach(async () => {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noUsername: true })
  if (!user) throw new Error('Failed to create test user')
  userId = user.id
})

test.describe('topic-recommendations/create — IDENTITY_REQUIRED gate', () => {
  test('shows username dialog instead of toast when submitting a recommendation without a username', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/topic-recommendations/create')

    const suffix = randomSuffix()
    await page
      .getByTestId('topic-recommendation-form-topic-title')
      .pressSequentially(`Identity Test Topic ${suffix}`)
    await page
      .getByTestId('topic-recommendation-form-topic-slug')
      .pressSequentially(`identity-topic-${suffix}`)
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .pressSequentially(
        'This topic is repeatedly discussed and should be promoted into the catalog.',
      )

    // Submit — should trigger the IDENTITY_REQUIRED 403
    await page.getByTestId('topic-recommendation-form-submit').click()

    // Dialog should appear instead of a toast
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    // Enter a username and confirm
    const username = `topic-rec-identity-${suffix}`
    await page.getByTestId('username-required-dialog-input').pressSequentially(username)
    await page.getByTestId('username-required-dialog-submit').click()

    // Should navigate to the topic-recommendations list after auto-retry
    await page.waitForURL('**/topic-recommendations')
  })

  test('dismissing the username dialog re-enables the Submit Recommendation button', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/topic-recommendations/create')

    const suffix = randomSuffix()
    await page
      .getByTestId('topic-recommendation-form-topic-title')
      .pressSequentially(`Cancel Dialog Test ${suffix}`)
    await page
      .getByTestId('topic-recommendation-form-topic-slug')
      .pressSequentially(`cancel-dialog-${suffix}`)
    await page
      .getByTestId('topic-recommendation-form-markdown')
      .pressSequentially('Testing that cancelling the dialog re-enables the submit button.')

    await page.getByTestId('topic-recommendation-form-submit').click()
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    // Dismiss the dialog
    await page.getByTestId('username-required-dialog-cancel').click()

    // Submit Recommendation button must be re-enabled
    await expect(page.getByTestId('topic-recommendation-form-submit')).toBeEnabled()
  })
})
