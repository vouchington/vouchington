import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_ID } from '../../../integration-tests/web/helpers/constants.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { insertTestPasskey } from '../../../backend/test-helpers/entities/passkeys.mts'

test.describe('Passkey management', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/identity')
  })

  test('shows passkeys section', async ({ page }) => {
    await expect(page.getByTestId('passkeys-heading')).toBeVisible()
    await expect(page.getByTestId('add-passkey-button')).toBeVisible()
  })

  test('shows a newly added passkey', async ({ page }) => {
    const passkey = await insertTestPasskey(TEST_USER_ID, randomSuffix())

    // Reload the passkeys list to show the newly inserted row.
    await navigateTo(page, '/my/identity')

    await expect(
      page.getByTestId(`passkey-item-${passkey.id}`).getByTestId('passkey-name'),
    ).toContainText(passkey.name)
  })

  test('renames a passkey', async ({ page }) => {
    const renamedName = `Renamed ${randomSuffix()}`

    // Insert passkey directly into the DB to avoid WebAuthn UI timing issues.
    // Same pattern as 'removes a passkey' — direct inserts narrow the window for
    // concurrent test interference to just the navigateTo + Rename + Save cycle.
    const passkey = await insertTestPasskey(TEST_USER_ID, randomSuffix())

    // Reload the passkeys list to show the newly inserted row.
    await navigateTo(page, '/my/identity')

    const passkeyItem = page.getByTestId(`passkey-item-${passkey.id}`)
    await passkeyItem.getByTestId('passkey-rename-button').click()

    const renameInput = passkeyItem.getByTestId('passkey-rename-input')
    await renameInput.fill(renamedName)
    await renameInput.evaluate(el => (el.closest('form') as HTMLFormElement).requestSubmit())

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Passkey renamed',
    )
    await expect(passkeyItem.getByTestId('passkey-name')).toContainText(renamedName)
  })

  test('removes a passkey', async ({ page }) => {
    // Insert both passkeys directly into the DB to avoid WebAuthn UI timing issues.
    // Using the virtual authenticator for 2 passkeys requires WebAuthn.clearCredentials
    // between creations (server excludeCredentials check), which creates a multi-second window
    // where concurrent tests can interfere. Direct inserts (~50ms) narrow this window to
    // just the navigateTo + Remove + Confirm cycle.
    const extraPasskey = await insertTestPasskey(TEST_USER_ID, randomSuffix())
    const targetPasskey = await insertTestPasskey(TEST_USER_ID, randomSuffix())

    // Reload the passkeys list to show the newly inserted rows.
    await navigateTo(page, '/my/identity')

    const passkeyItem = page.getByTestId(`passkey-item-${targetPasskey.id}`)
    await passkeyItem.getByTestId('passkey-remove-button').click()
    await passkeyItem.getByTestId('passkey-remove-confirm-button').click()

    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
      'Passkey removed',
    )
    await expect(page.getByTestId(`passkey-item-${targetPasskey.id}`)).toBeHidden()
    // Extra passkey must still be present (only the target was removed)
    await expect(page.getByTestId(`passkey-item-${extraPasskey.id}`)).toBeVisible()
  })
})
