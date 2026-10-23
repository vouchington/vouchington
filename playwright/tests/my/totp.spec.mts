import { test, expect, type Page } from '../../helpers/test.mts'
import {
  navigateTo,
  randomSuffix,
  generateTotpCode,
  waitForBelowFoldHydration,
} from 'vouchington-tooling/playwright'
import { withCleanUser } from '../../helpers/auth.mts'
import { confirmAccountChange } from '../../helpers/account-confirmation.mts'
import { insertTestTotpAuthenticator } from '../../../backend/test-helpers/entities/totp.mts'

async function performSetupFlow(page: Page, userId: string, name: string): Promise<string> {
  const addButton = page.getByTestId('totp-add-authenticator-button')
  await addButton.scrollIntoViewIfNeeded()
  await waitForBelowFoldHydration(page)
  await addButton.click()
  await page.getByTestId('totp-setup-name-input').pressSequentially(name)
  const setupResponse = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/v1/auth/totp' &&
      response.request().method() === 'POST',
  )
  await page.getByTestId('totp-start-setup-button').click()
  await confirmAccountChange(page, userId)
  const setup = (await (await setupResponse).json()) as {
    authenticator: { id: string }
    secret: string
  }
  await expect(page.getByTestId('totp-setup-qr-prompt')).toBeVisible()
  const code = await generateTotpCode(page, setup.secret)
  const verification = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/api/v1/auth/totp/setup/verification' &&
      response.request().method() === 'POST',
  )
  await page.locator('input[inputmode="numeric"]').pressSequentially(code)
  await confirmAccountChange(page, userId)
  await verification
  await expect(page.getByTestId(`totp-authenticator-item-${setup.authenticator.id}`)).toBeVisible()
  return setup.authenticator.id
}

test.describe('TOTP authenticator management', () => {
  let userId: string

  test.beforeEach(async ({ page }) => {
    const user = await withCleanUser(page)
    userId = user.id
    await insertTestTotpAuthenticator(userId, randomSuffix())
    await navigateTo(page, '/my/identity')
  })

  test('shows Authenticator Apps section', async ({ page }) => {
    await expect(page.getByTestId('totp-manager-heading')).toBeVisible()
    await expect(page.getByTestId('totp-add-authenticator-button')).toBeVisible()
  })

  test('adds a TOTP authenticator after confirming both stages', async ({ page }) => {
    const id = await performSetupFlow(page, userId, `Playwright App ${randomSuffix()}`)
    await expect(page.getByTestId(`totp-authenticator-item-${id}`)).toBeVisible()
  })

  test('renames a TOTP authenticator', async ({ page }) => {
    const authenticator = await insertTestTotpAuthenticator(userId, randomSuffix())
    const newName = `Renamed App ${randomSuffix()}`
    await navigateTo(page, '/my/identity')
    const item = page.getByTestId(`totp-authenticator-item-${authenticator.id}`)
    await item.getByTestId('totp-rename-button').click()
    const input = item.getByTestId('totp-rename-input')
    await input.clear()
    await input.pressSequentially(newName)
    await input.press('Enter')
    await expect(item.getByTestId('totp-authenticator-name')).toHaveText(newName)
  })

  test('keeps a factor when fresh confirmation is cancelled', async ({ page }) => {
    const authenticator = await insertTestTotpAuthenticator(userId, randomSuffix())
    await navigateTo(page, '/my/identity')
    const item = page.getByTestId(`totp-authenticator-item-${authenticator.id}`)
    await item.getByTestId('totp-remove-button').click()
    await item.getByTestId('totp-remove-confirm-button').click()
    const dialog = page.getByTestId('mfa-reauth-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('mfa-reauth-dialog-cancel-button').click()
    await expect(dialog).toBeHidden()
    await expect(item).toBeVisible()
  })
})
