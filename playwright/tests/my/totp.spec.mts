import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { insertTestPasskey } from '../../../backend/test-helpers/index.mts'

const MOCK_AUTHENTICATOR_ID = '00000000-0000-0000-0000-aabbccddeeff'

function makeMockAuthenticator(name: string) {
  return {
    id: MOCK_AUTHENTICATOR_ID,
    name,
    created_at: new Date().toISOString(),
  }
}

async function mockTotpSetupRoutes(page: Page, authenticatorName: string) {
  const authenticator = makeMockAuthenticator(authenticatorName)
  await page.route('**/api/v1/auth/totp', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticator,
        secret: 'JBSWY3DPEHPK3PXP',
        uri: `otpauth://totp/Test:tests%40voucha.ai?secret=JBSWY3DPEHPK3PXP&issuer=Test`,
      }),
    })
  })
  await page.route('**/api/v1/auth/totp/setup/verification', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticator }),
    })
  })
  return authenticator
}

async function performSetupFlow(page: Page, authenticatorName: string) {
  const addButton = page.getByTestId('totp-add-authenticator-button')
  const nameInput = page.getByTestId('totp-setup-name-input')

  // Scroll TotpManager into view first so React can see it in the viewport
  await addButton.scrollIntoViewIfNeeded()

  await waitForBelowFoldHydration(page)

  await addButton.click()
  await expect(nameInput).toBeVisible()

  await nameInput.fill(authenticatorName)
  await page.getByTestId('totp-start-setup-button').click()

  await expect(page.getByTestId('totp-setup-qr-prompt')).toBeVisible()

  // Enter the 6-digit verification code — auto-submits at 6 digits
  const otpInput = page.locator('input[inputmode="numeric"]').first()
  await otpInput.pressSequentially('123456')

  await expect(page.getByTestId(`totp-authenticator-item-${MOCK_AUTHENTICATOR_ID}`)).toBeVisible()
}

test.describe('TOTP authenticator management', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/my/identity')
  })

  test('shows Authenticator Apps section', async ({ page }) => {
    await expect(page.getByTestId('totp-manager-heading')).toBeVisible()
    await expect(page.getByTestId('totp-add-authenticator-button')).toBeVisible()
  })

  test('adds a TOTP authenticator', async ({ page }) => {
    const name = `Playwright App ${randomSuffix()}`
    await mockTotpSetupRoutes(page, name)

    await performSetupFlow(page, name)

    await expect(page.getByTestId(`totp-authenticator-item-${MOCK_AUTHENTICATOR_ID}`)).toBeVisible()
  })

  test('renames a TOTP authenticator', async ({ page }) => {
    const name = `Playwright App ${randomSuffix()}`
    const newName = `Renamed App ${randomSuffix()}`

    await mockTotpSetupRoutes(page, name)
    await page.route(`**/api/v1/auth/totp/${MOCK_AUTHENTICATOR_ID}`, async route => {
      if (route.request().method() !== 'PATCH') return route.continue()
      await route.fulfill({ status: 204 })
    })

    await performSetupFlow(page, name)

    const authenticatorItem = page.getByTestId(`totp-authenticator-item-${MOCK_AUTHENTICATOR_ID}`)
    await authenticatorItem.getByTestId('totp-rename-button').click()

    const renameInput = page.getByTestId('totp-rename-input')
    await renameInput.fill(newName)
    await renameInput.evaluate(el => (el.closest('form') as HTMLFormElement).requestSubmit())

    await expect(authenticatorItem.getByTestId('totp-authenticator-name')).toHaveText(newName)
  })

  test('remove triggers re-auth dialog after multi-MFA confirmation', async ({ page }) => {
    const name = `Playwright App ${randomSuffix()}`

    const user = await withCleanUser(page)
    await insertTestPasskey(user.id, randomSuffix())
    await navigateTo(page, '/my/identity')
    await mockTotpSetupRoutes(page, name)

    // Mock DELETE to return MFA_REAUTH_REQUIRED so the re-auth dialog opens via the
    // server fallback path. This is needed when the shared test user has passkeys,
    // in which case the client-side totalMfa check shows an inline confirm first.
    await page.route(`**/api/v1/auth/totp/${MOCK_AUTHENTICATOR_ID}`, async route => {
      if (route.request().method() !== 'DELETE') return route.continue()
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Re-authentication required to remove last MFA method',
          code: 'MFA_REAUTH_REQUIRED',
        }),
      })
    })

    await performSetupFlow(page, name)

    // The isolated user has a passkey, so TOTP removal requires an explicit confirmation.
    const authenticatorItem = page.getByTestId(`totp-authenticator-item-${MOCK_AUTHENTICATOR_ID}`)
    await authenticatorItem.getByTestId('totp-remove-button').click()
    const confirmButton = authenticatorItem.getByTestId('totp-remove-confirm-button')
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    await expect(page.getByTestId('mfa-reauth-dialog')).toBeVisible()
    await expect(page.getByTestId('mfa-reauth-dialog-title')).toBeVisible()

    // Cancel — authenticator should still be in the list
    await page.getByTestId('mfa-reauth-dialog-cancel-button').click()
    await expect(authenticatorItem).toBeVisible()
  })
})
