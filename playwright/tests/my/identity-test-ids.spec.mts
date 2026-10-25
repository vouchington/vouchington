import { test, expect } from '../../helpers/test.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { addVerifiedEmailForUser } from '../../../backend/test-helpers/entities/email-addresses.mts'
import {
  connectTestOAuthAccount,
  insertTestOAuthAccount,
} from '../../../backend/test-helpers/entities/oauth-accounts.mts'
import { insertTestTotpAuthenticator } from '../../../backend/test-helpers/entities/totp.mts'
import { insertTestPasskey } from '../../../backend/test-helpers/entities/passkeys.mts'
import { insertTestUserSession } from '../../../backend/test-helpers/entities/user-sessions.mts'
import { mintTestNativeSessionMcpGrant } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

test.describe('My Identity page test ids', () => {
  test('email manager controls', async ({ page }) => {
    const user = await withCleanUser(page)
    await addVerifiedEmailForUser(user.id, `tests+pw-secondary-${randomSuffix()}@voucha.ai`)
    await navigateTo(page, '/my/identity')

    await expect(page.getByTestId('email-list-set-primary')).toBeVisible()
    await expect(page.getByTestId('email-list-remove')).toBeVisible()

    await page.getByTestId('email-manager-add-email-address').click()
    await expect(page.getByTestId('add-email-form-send-verification-code')).toBeVisible()
    await expect(page.getByTestId('add-email-form-cancel')).toBeVisible()

    await page
      .getByRole('textbox')
      .last()
      .pressSequentially(`tests+pw-new-${randomSuffix()}@voucha.ai`)
    const verificationRequested = page.waitForResponse(
      response =>
        response.url().endsWith('/api/v1/my/email-addresses') &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('add-email-form-send-verification-code').click()
    expect((await verificationRequested).ok()).toBe(true)
    await expect(page.getByTestId('verify-email-form-verify')).toBeVisible()
    await expect(page.getByTestId('verify-email-form-cancel')).toBeVisible()
  })

  test('passkey controls', async ({ page }) => {
    const user = await withCleanUser(page)
    const passkey = await insertTestPasskey(user.id, randomSuffix())
    await insertTestPasskey(user.id, randomSuffix())
    await navigateTo(page, '/my/identity')

    const passkeyItem = page.getByTestId(`passkey-item-${passkey.id}`)
    await passkeyItem.getByTestId('passkey-rename-button').click()
    await expect(passkeyItem.getByTestId('passkey-rename-save')).toBeVisible()
    await passkeyItem.getByTestId('passkey-rename-cancel').click()

    await passkeyItem.getByTestId('passkey-remove-button').click()
    await expect(passkeyItem.getByTestId('passkey-remove-cancel')).toBeVisible()

    await page.getByTestId('add-passkey-button').click()
    await expect(page.getByTestId('add-passkey-form-cancel')).toBeVisible()
  })

  test('connected OAuth account disconnect control', async ({ page }) => {
    const user = await withCleanUser(page)
    const providerUserId = `pw-github-${randomSuffix()}`
    await insertTestOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`)
    await connectTestOAuthAccount('github', user.id, providerUserId)
    await navigateTo(page, '/my/identity')

    await expect(page.getByTestId('oauth-connection-disconnect')).toBeVisible()
  })

  test('active session MCP revoke and confirmation controls', async ({ page }) => {
    const user = await withCleanUser(page)
    const session = await insertTestUserSession({
      userId: user.id,
      deviceName: 'Playwright MCP device',
      authOrigin: 'native',
    })
    await mintTestNativeSessionMcpGrant(user, session)
    await navigateTo(page, '/my/identity')

    await page
      .getByTestId(`active-session-item-${session.id}`)
      .getByTestId('active-session-row-revoke-mcp-access')
      .click()
    await expect(page.getByTestId('active-sessions-confirmation-dialog-confirm')).toBeVisible()
  })

  test('re-authentication dialog controls', async ({ page }) => {
    const user = await withCleanUser(page)
    await insertTestPasskey(user.id, randomSuffix())
    const totp = await insertTestTotpAuthenticator(user.id, randomSuffix())
    await page.route(`**/api/v1/auth/totp/${totp.id}`, route => {
      if (route.request().method() !== 'DELETE') return route.continue()
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Re-authentication required',
          code: 'MFA_REAUTH_REQUIRED',
        }),
      })
    })
    await page.route('**/api/v1/auth/mfa/re-auth/email/tokens', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email_address: 'tests+pw-reauth@voucha.ai' }),
      }),
    )
    await page.route('**/api/v1/auth/re-auth/methods', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_totp: true,
          has_email: true,
          has_passkey: true,
          providers: ['apple', 'google', 'facebook', 'x', 'github', 'linkedin', 'microsoft'],
        }),
      }),
    )
    await navigateTo(page, '/my/identity')

    const item = page.getByTestId(`totp-authenticator-item-${totp.id}`)
    await item.getByTestId('totp-remove-button').click()
    await item.getByTestId('totp-remove-confirm-button').click()

    await expect(page.getByTestId('method-selector-authenticator-app')).toBeVisible()
    await expect(page.getByTestId('method-selector-apple')).toBeVisible()
    await expect(page.getByTestId('method-selector-google')).toBeVisible()
    await expect(page.getByTestId('method-selector-facebook')).toBeVisible()
    await expect(page.getByTestId('method-selector-x')).toBeVisible()
    await expect(page.getByTestId('method-selector-github')).toBeVisible()
    await expect(page.getByTestId('method-selector-linkedin')).toBeVisible()
    await expect(page.getByTestId('method-selector-microsoft')).toBeVisible()
    await expect(page.getByTestId('method-selector-passkey')).toBeVisible()
    await expect(page.getByTestId('verification-panes-totp-verify')).toBeVisible()
    await page.getByTestId('method-selector-email-verification').click()
    await page.getByTestId('verification-panes-email-send-code').click()
    await expect(page.getByTestId('verification-panes-email-verify')).toBeVisible()
    await expect(page.getByTestId('verification-panes-email-resend')).toBeVisible()
  })
})
