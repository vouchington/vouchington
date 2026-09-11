import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { setupTotpAuthenticator, cleanupTotpAuthenticator } from '../../helpers/totp.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUserDirect } from '../../../backend/test-helpers/entities/users.mts'

/**
 * Tests that removing the last MFA method requires re-authentication.
 * Uses a dedicated isolated user per test so passkeys accumulated on the
 * shared test user by parallel passkey specs cannot affect the "last method" check.
 */
test.describe('Last MFA method protection', () => {
  test('removing last TOTP authenticator opens re-auth dialog', async ({ page }) => {
    const user = await createTestUserDirect()
    await loginAsUser(page, user!.id)

    const authenticatorName = `Playwright Last MFA ${randomSuffix()}`
    const { authenticatorId, secret } = await setupTotpAuthenticator(page, authenticatorName)

    try {
      await navigateTo(page, '/my/identity')

      await expect(page.getByTestId('totp-manager-heading')).toBeVisible()

      const authenticatorItem = page.getByTestId(`totp-authenticator-item-${authenticatorId}`)
      await expect(authenticatorItem).toBeVisible()

      const removeButton = authenticatorItem.getByTestId('totp-remove-button')

      // Scroll TotpManager into view so React can see it in the viewport
      await removeButton.scrollIntoViewIfNeeded()

      await waitForBelowFoldHydration(page)

      await removeButton.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByTestId('mfa-reauth-dialog-title')).toBeVisible()
      await expect(page.getByTestId('mfa-reauth-dialog-description')).toBeVisible()

      // Cancel and verify the authenticator is still present
      await page.getByTestId('mfa-reauth-dialog-cancel-button').click()
      await expect(page.getByRole('dialog')).toBeHidden()
    } finally {
      // Always restore test user to clean state, even if assertions fail.
      await cleanupTotpAuthenticator(page, authenticatorId, secret)
    }
  })
})
