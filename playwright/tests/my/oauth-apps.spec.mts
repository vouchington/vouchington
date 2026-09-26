import { expect, test, type Locator, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { revokeTestOAuthClient } from '../../../backend/test-helpers/entities/oauth-client-management.mts'
import { createOwnedOAuthApp } from '../../../backend/services/oauth-authorization-server/app-management.mts'
import { randomTestOAuthRedirectUri } from '../../../backend/services/oauth-authorization-server/test-support.mts'

function oauthAppRows(page: Page, clientName: string) {
  return page
    .getByTestId('oauth-apps-section')
    .getByTestId('oauth-app-row')
    .filter({ hasText: clientName })
}

function waitForOAuthAppRequest(page: Page, method: string, path: RegExp) {
  return page.waitForResponse(
    response =>
      path.test(new URL(response.url()).pathname) && response.request().method() === method,
  )
}

async function fillRegisterForm(form: Locator, name: string, redirectUri: string) {
  await form.getByTestId('oauth-app-name-input').pressSequentially(name)
  await form.getByTestId('oauth-app-redirect-uris-input').pressSequentially(redirectUri)
  const scope = form
    .getByTestId('oauth-app-register-scope-picker')
    .getByTestId('scope-checkbox-mcp.user:read')
  await scope.click()
  await expect(scope).toBeChecked()
}

async function openSettingsWithOwnedApp(page: Page) {
  const user = await withCleanUser(page)
  const { oauth_app } = await createOwnedOAuthApp(user.id, {
    client_name: `Playwright OAuth app ${randomSuffix()}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    token_endpoint_auth_method: 'client_secret_basic',
    scopes: ['mcp.user:read'],
  })
  await navigateTo(page, '/my/api-keys')
  const row = oauthAppRows(page, oauth_app.client_name)
  await expect(row).toBeVisible()
  return { app: oauth_app, row }
}

async function renameApp(row: Locator, name: string) {
  await row.getByTestId('oauth-app-edit-button').click()
  const nameInput = row.getByTestId('oauth-app-edit-form').getByTestId('oauth-app-name-input')
  await nameInput.clear()
  await nameInput.pressSequentially(name)
  await row.getByTestId('oauth-app-edit-save-button').click()
}

test.describe('My OAuth Apps', () => {
  test.use({ storageState: AUTH_STATE })

  test('registers a confidential app and shows its secret once', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/api-keys')
    const name = `Playwright OAuth app ${randomSuffix()}`
    const redirectUri = randomTestOAuthRedirectUri()
    const form = page.getByTestId('oauth-app-register-form')
    await expect(form.getByTestId('oauth-app-register-button')).toBeDisabled()

    await fillRegisterForm(form, name, redirectUri)
    await form.getByTestId('oauth-app-client-type-confidential').click()
    const registration = waitForOAuthAppRequest(page, 'POST', /^\/api\/v1\/my\/oauth-apps$/)
    await form.getByTestId('oauth-app-register-button').click()
    expect((await registration).status()).toBe(201)

    await expect(page.getByTestId('oauth-app-secret-alert')).toBeVisible()
    await expect(page.getByTestId('oauth-app-client-secret-input')).not.toHaveValue('')
    await page.getByTestId('oauth-app-secret-dismiss-button').click()
    await expect(page.getByTestId('oauth-app-secret-alert')).toBeHidden()
    await expect(form.getByTestId('oauth-app-name-input')).toHaveValue('')

    const row = oauthAppRows(page, name)
    await expect(row).toContainText(redirectUri)
    await expect(row).toContainText('mcp.user:read')
    await expect(row.getByTestId('oauth-app-rotate-secret-button')).toBeVisible()
    await page.reload()
    await waitForBelowFoldHydration(page)
    await expect(oauthAppRows(page, name)).toBeVisible()
  })

  test('registers a public app without a client secret', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/api-keys')
    const name = `Playwright public app ${randomSuffix()}`
    const form = page.getByTestId('oauth-app-register-form')

    await fillRegisterForm(form, name, randomTestOAuthRedirectUri())
    await form.getByTestId('oauth-app-client-type-public').click()
    const registration = waitForOAuthAppRequest(page, 'POST', /^\/api\/v1\/my\/oauth-apps$/)
    await form.getByTestId('oauth-app-register-button').click()
    expect((await registration).status()).toBe(201)

    const row = oauthAppRows(page, name)
    await expect(row).toContainText('Public')
    await expect(page.getByTestId('oauth-app-secret-alert')).toBeHidden()
    await expect(row.getByTestId('oauth-app-rotate-secret-button')).toHaveCount(0)
  })

  test('keeps the form filled when the API rejects a redirect URI', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/api-keys')
    const name = `Playwright rejected app ${randomSuffix()}`
    const form = page.getByTestId('oauth-app-register-form')

    await fillRegisterForm(form, name, 'http://example.com/callback')
    const registration = waitForOAuthAppRequest(page, 'POST', /^\/api\/v1\/my\/oauth-apps$/)
    await form.getByTestId('oauth-app-register-button').click()
    expect((await registration).status()).toBe(422)

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'HTTPS' })).toBeVisible()
    await expect(form.getByTestId('oauth-app-name-input')).toHaveValue(name)
    await expect(oauthAppRows(page, name)).toHaveCount(0)
  })

  test('renames, rotates the secret of, and revokes an owned app', async ({ page }) => {
    const { row } = await openSettingsWithOwnedApp(page)
    const renamed = `Renamed Playwright OAuth app ${randomSuffix()}`

    const update = waitForOAuthAppRequest(page, 'PATCH', /^\/api\/v1\/my\/oauth-apps\/[^/]+$/)
    await renameApp(row, renamed)
    expect((await update).status()).toBe(200)
    const renamedRow = oauthAppRows(page, renamed)
    await expect(renamedRow).toBeVisible()
    await expect(renamedRow.getByTestId('oauth-app-edit-form')).toHaveCount(0)

    await renamedRow.getByTestId('oauth-app-rotate-secret-button').click()
    const rotation = waitForOAuthAppRequest(page, 'POST', /\/oauth-apps\/[^/]+\/client-secrets$/)
    await renamedRow.getByTestId('oauth-app-confirm-button').click()
    expect((await rotation).status()).toBe(201)
    await expect(page.getByTestId('oauth-app-client-secret-input')).not.toHaveValue('')
    await page.getByTestId('oauth-app-secret-dismiss-button').click()

    await renamedRow.getByTestId('oauth-app-revoke-button').click()
    const revocation = waitForOAuthAppRequest(page, 'DELETE', /^\/api\/v1\/my\/oauth-apps\/[^/]+$/)
    await renamedRow.getByTestId('oauth-app-confirm-button').click()
    expect((await revocation).status()).toBe(204)
    await expect(renamedRow).toHaveCount(0)
    await page.reload()
    await waitForBelowFoldHydration(page)
    await expect(oauthAppRows(page, renamed)).toHaveCount(0)
  })

  test('keeps the edit form open when the app was revoked elsewhere', async ({ page }) => {
    const { app, row } = await openSettingsWithOwnedApp(page)
    await revokeTestOAuthClient(app.id)

    const update = waitForOAuthAppRequest(page, 'PATCH', /^\/api\/v1\/my\/oauth-apps\/[^/]+$/)
    await renameApp(row, `Renamed Playwright OAuth app ${randomSuffix()}`)
    expect((await update).status()).toBe(404)

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'not found' })).toBeVisible()
    await expect(row.getByTestId('oauth-app-edit-form')).toBeVisible()
  })
})
