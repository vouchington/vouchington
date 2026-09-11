import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '../../../backend/test-helpers/index.mts'

let userId: string

test.beforeEach(async () => {
  const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, { noUsername: true })
  if (!user) throw new Error('Failed to create test user')
  userId = user.id
})

test.describe('communities/create — IDENTITY_REQUIRED gate', () => {
  test('shows username dialog instead of error banner when creating a community without a username', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/communities/create')

    const suffix = randomSuffix()
    await page
      .getByTestId('create-community-name-input')
      .pressSequentially(`Identity Test Community ${suffix}`)

    // Submit — should trigger the IDENTITY_REQUIRED 403
    await page.getByTestId('create-community-submit-button').click()

    // Dialog should appear instead of an error banner
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    // Enter a username and confirm
    const username = `comm-identity-${suffix}`
    await page.getByTestId('username-required-dialog-input').pressSequentially(username)
    await page.getByTestId('username-required-dialog-submit').click()

    // Should navigate to the new community detail page
    await page.waitForURL(/\/communities\//)
    await expect(page.getByTestId('community-header-name')).toContainText(
      `Identity Test Community ${suffix}`,
    )
  })

  test('dismissing the username dialog re-enables the Create Community button', async ({
    page,
  }) => {
    await loginAsUser(page, userId)
    await navigateTo(page, '/communities/create')

    const suffix = randomSuffix()
    await page
      .getByTestId('create-community-name-input')
      .pressSequentially(`Cancel Dialog Test ${suffix}`)

    await page.getByTestId('create-community-submit-button').click()
    await expect(page.getByTestId('username-required-dialog')).toBeVisible()

    // Dismiss the dialog
    await page.getByTestId('username-required-dialog-cancel').click()

    // Create Community button must be re-enabled
    await expect(page.getByTestId('create-community-submit-button')).toBeEnabled()
  })
})
