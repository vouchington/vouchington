import { expect, test, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import {
  TEST_OAUTH_RESOURCE,
  createTestApprovedOAuthAuthorization,
} from '../../../backend/services/oauth-authorization-server/test-support.mts'
import { revokeTestOAuthGrant } from '../../../backend/test-helpers/entities/oauth-authorization-server.mts'

async function openConnectedAppWithGrant(page: Page) {
  const user = await withCleanUser(page)
  const { client } = await createTestApprovedOAuthAuthorization(user)
  await navigateTo(page, '/my/connected-apps')
  const row = page
    .getByTestId('connected-apps-list')
    .getByTestId('connected-app-row')
    .filter({ hasText: client.client_name })
  return { client, row }
}

function waitForGrantRevocation(page: Page) {
  return page.waitForResponse(
    response =>
      response.url().includes('/api/v1/my/oauth-grants/') &&
      response.request().method() === 'DELETE',
  )
}

test.describe('My Connected Apps', () => {
  test.use({ storageState: AUTH_STATE })

  test('lists an approved app and revokes its access', async ({ page }) => {
    const { client, row } = await openConnectedAppWithGrant(page)

    await expect(row).toContainText(TEST_OAUTH_RESOURCE)
    await expect(row).toContainText('mcp.user:read')
    await expect(row).toContainText('Unverified')

    await row.getByTestId('connected-app-revoke-button').click()
    const revocation = waitForGrantRevocation(page)
    await row.getByTestId('connected-app-revoke-confirm-button').click()
    expect((await revocation).status()).toBe(204)

    await expect(row).toHaveCount(0)
    await page.reload()
    await waitForBelowFoldHydration(page)
    await expect(
      page.getByTestId('connected-app-row').filter({ hasText: client.client_name }),
    ).toHaveCount(0)
  })

  test('keeps the app listed when the grant was already revoked elsewhere', async ({ page }) => {
    const { client, row } = await openConnectedAppWithGrant(page)
    await expect(row).toBeVisible()
    await revokeTestOAuthGrant(client.client_id)

    await row.getByTestId('connected-app-revoke-button').click()
    const revocation = waitForGrantRevocation(page)
    await row.getByTestId('connected-app-revoke-confirm-button').click()
    expect((await revocation).status()).toBe(404)

    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'not found' })).toBeVisible()
    await expect(row).toBeVisible()
    await expect(row.getByTestId('connected-app-revoke-button')).toBeVisible()
  })
})
