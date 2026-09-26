import { expect, test, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import {
  createOwnedOAuthApp,
  updateOwnedOAuthApp,
} from '../../../backend/services/oauth-authorization-server/app-management.mts'
import { randomTestOAuthRedirectUri } from '../../../backend/services/oauth-authorization-server/test-support.mts'

async function registerOwnedApp() {
  const owner = await createTestUser()
  const { oauth_app } = await createOwnedOAuthApp(owner.id, {
    client_name: `Playwright OAuth app ${randomSuffix()}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    scopes: ['mcp.user:read'],
  })
  return { owner, app: oauth_app }
}

function clientRow(page: Page, clientName: string) {
  return page.getByTestId('admin-oauth-client-row').filter({ hasText: clientName })
}

function waitForVerificationChange(page: Page, method: 'PUT' | 'DELETE') {
  return page.waitForResponse(
    response =>
      response.url().includes('/api/v1/admin/oauth-clients/') &&
      response.url().endsWith('/verification') &&
      response.request().method() === method,
  )
}

test.describe('Admin OAuth Clients', () => {
  test.use({ storageState: AUTH_STATE })

  test('verifies an owned app and removes the verification', async ({ page }) => {
    const { app } = await registerOwnedApp()
    await navigateTo(page, '/admin/oauth-clients')
    await expect(page.getByTestId('admin-oauth-clients-heading')).toContainText('OAuth')

    const row = clientRow(page, app.client_name)
    await expect(row).toContainText(app.client_id)
    await expect(row).toContainText('mcp.user:read')
    await expect(row).toContainText('Unverified')

    const verification = waitForVerificationChange(page, 'PUT')
    await row.getByTestId('admin-oauth-client-verification-button').click()
    expect((await verification).status()).toBe(200)
    await expect(row.getByTestId('admin-oauth-client-verification-button')).toContainText('Remove')
    await expect(row).toContainText('Verified')

    await page.getByTestId('admin-oauth-clients-filter-verified').click()
    await expect(page).toHaveURL(/verification=verified/)
    const verifiedRow = clientRow(page, app.client_name)
    await expect(verifiedRow).toBeVisible()

    const removal = waitForVerificationChange(page, 'DELETE')
    await verifiedRow.getByTestId('admin-oauth-client-verification-button').click()
    expect((await removal).status()).toBe(204)
    await expect(verifiedRow.getByTestId('admin-oauth-client-verification-button')).toContainText(
      'Verify',
    )
    await expect(verifiedRow).toContainText('Unverified')

    await page.getByTestId('admin-oauth-clients-filter-all').click()
    await expect(page).toHaveURL(/verification=all/)
    await expect(clientRow(page, app.client_name)).toContainText('Unverified')
  })

  test('refuses to verify an app renamed after the page loaded', async ({ page }) => {
    const { owner, app } = await registerOwnedApp()
    await navigateTo(page, '/admin/oauth-clients?verification=unverified')
    await expect(page.getByTestId('admin-oauth-clients-filter-unverified')).toBeVisible()
    const row = clientRow(page, app.client_name)
    await expect(row).toBeVisible()

    await updateOwnedOAuthApp(owner.id, app.id, {
      client_name: `Renamed Playwright OAuth app ${randomSuffix()}`,
    })

    const verification = waitForVerificationChange(page, 'PUT')
    await row.getByTestId('admin-oauth-client-verification-button').click()
    expect((await verification).status()).toBe(409)
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'name changed' }),
    ).toBeVisible()
    await expect(row).toContainText('Unverified')
    await expect(row.getByTestId('admin-oauth-client-verification-button')).toContainText('Verify')
  })
})
