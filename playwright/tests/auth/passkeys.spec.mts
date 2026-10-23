import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { confirmAccountChange } from '../../helpers/account-confirmation.mts'
import { insertTestTotpAuthenticator } from '../../../backend/test-helpers/entities/totp.mts'
import {
  navigateTo,
  randomSuffix,
  setupVirtualAuthenticator,
  waitForBelowFoldHydration,
} from 'vouchington-tooling/playwright'

test.describe('Passkey management', () => {
  test('adds and removes a passkey from identity page', async ({ page }) => {
    await setupVirtualAuthenticator(page)
    const passkeyName = `Playwright Test ${randomSuffix()}`

    const user = await withCleanUser(page)
    await insertTestTotpAuthenticator(user.id, randomSuffix())
    await navigateTo(page, '/my/identity')
    const addPasskeyButton = page.getByTestId('add-passkey-button')
    await addPasskeyButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await addPasskeyButton.click()
    await page.getByTestId('passkey-name-input').pressSequentially(passkeyName)
    const createPasskeyButton = page.getByTestId('create-passkey-button')
    await createPasskeyButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    const registration = page.waitForResponse(
      response =>
        new URL(response.url()).pathname === '/api/v1/auth/passkeys/registration/verify' &&
        response.request().method() === 'POST',
    )
    await createPasskeyButton.click()
    await confirmAccountChange(page, user.id)
    const created = (await (await registration).json()) as { passkey: { id: string } }
    await expect(page.locator('[data-sonner-toast]')).toContainText('Passkey added successfully')
    await expect(page.getByTestId('passkey-name').filter({ hasText: passkeyName })).toBeVisible()

    const item = page.getByTestId(`passkey-item-${created.passkey.id}`)
    await item.getByTestId('passkey-remove-button').click()
    await item.getByTestId('passkey-remove-confirm-button').click()
    await confirmAccountChange(page, user.id)
    await expect(item).toBeHidden()
  })
})
