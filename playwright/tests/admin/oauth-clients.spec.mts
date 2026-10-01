import { expect, test, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { createTestUser } from '../../../backend/test-helpers/index.mts'
import {
  createOwnedOAuthApp,
  updateOwnedOAuthApp,
} from '../../../backend/services/oauth-authorization-server/app-management.mts'
import { randomTestOAuthRedirectUri } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'

async function registerOwnedApp() {
  const owner = await createTestUser()
  const { oauth_app } = await createOwnedOAuthApp(owner.id, {
    client_name: `Playwright OAuth app ${randomSuffix()}`,
    redirect_uris: [randomTestOAuthRedirectUri()],
    scopes: ['mcp.user:read'],
  })
  return { owner, app: oauth_app }
}

// Key rows on the client id: the name can change, and a list refresh then re-renders the row.
function clientRow(page: Page, clientId: string) {
  return page.getByTestId('admin-oauth-client-row').filter({ hasText: clientId })
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

    const row = clientRow(page, app.client_id)
    await expect(row).toContainText(app.client_id)
    await expect(row).toContainText('mcp.user:read')
    await expect(row).toContainText('Unverified')

    const verification = waitForVerificationChange(page, 'PUT')
    await row.getByTestId('admin-oauth-client-verification-button').click()
    expect((await verification).status()).toBe(200)
    // The refresh after the write drops the verified app from the unverified list.
    await expect(row).toHaveCount(0)

    await page.getByTestId('admin-oauth-clients-filter-verified').click()
    await expect(page).toHaveURL(/verification=verified/)
    const verifiedRow = clientRow(page, app.client_id)
    await expect(verifiedRow).toContainText('Verified')
    await expect(verifiedRow.getByTestId('admin-oauth-client-verification-button')).toContainText(
      'Remove',
    )

    const removal = waitForVerificationChange(page, 'DELETE')
    await verifiedRow.getByTestId('admin-oauth-client-verification-button').click()
    expect((await removal).status()).toBe(204)
    await expect(verifiedRow).toHaveCount(0)

    await page.getByTestId('admin-oauth-clients-filter-all').click()
    await expect(page).toHaveURL(/verification=all/)
    const allRow = clientRow(page, app.client_id)
    await expect(allRow).toContainText('Unverified')
    await expect(allRow.getByTestId('admin-oauth-client-verification-button')).toContainText(
      'Verify',
    )
  })

  test('refuses to verify an app renamed after the page loaded', async ({ page }) => {
    const { owner, app } = await registerOwnedApp()
    await navigateTo(page, '/admin/oauth-clients?verification=unverified')
    await expect(page.getByTestId('admin-oauth-clients-filter-unverified')).toBeVisible()
    const row = clientRow(page, app.client_id)
    await expect(row).toBeVisible()

    const renamed = `Renamed Playwright OAuth app ${randomSuffix()}`
    await updateOwnedOAuthApp(owner.id, app.id, { client_name: renamed })

    const verification = waitForVerificationChange(page, 'PUT')
    await row.getByTestId('admin-oauth-client-verification-button').click()
    expect((await verification).status()).toBe(409)
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'name or redirect URIs changed' }),
    ).toBeVisible()
    // The refused verification re-fetches the list, so the same app now shows its new name.
    await expect(row).toContainText(renamed)
    await expect(row).toContainText('Unverified')
    await expect(row.getByTestId('admin-oauth-client-verification-button')).toContainText('Verify')
  })
})
