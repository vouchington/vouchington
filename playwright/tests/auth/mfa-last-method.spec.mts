import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo, randomSuffix, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'
import { createTestUserDirect } from '../../../backend/test-helpers/entities/users.mts'
import { insertTestTotpAuthenticator } from '../../../backend/test-helpers/entities/totp.mts'

test.describe('Last MFA method confirmation', () => {
  test('cancelling removal keeps the last authenticator', async ({ page }) => {
    const user = await createTestUserDirect()
    const authenticator = await insertTestTotpAuthenticator(user.id, randomSuffix())
    await loginAsUser(page, user.id)
    await navigateTo(page, '/my/identity')
    const item = page.getByTestId(`totp-authenticator-item-${authenticator.id}`)
    const remove = item.getByTestId('totp-remove-button')
    await remove.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await remove.click()
    await item.getByTestId('totp-remove-confirm-button').click()
    const dialog = page.getByTestId('mfa-reauth-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('mfa-reauth-dialog-title')).toBeVisible()
    await expect(page.getByTestId('mfa-reauth-dialog-description')).toBeVisible()
    await page.getByTestId('mfa-reauth-dialog-cancel-button').click()
    await expect(dialog).toBeHidden()
    await expect(item).toBeVisible()
  })
})
