import { test, expect, type Page } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { setFeatureFlags } from '../../helpers/feature-flags.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
async function getMembershipPageHeading(page: Page): Promise<ReturnType<Page['locator']>> {
  await navigateTo(page, '/my/membership')
  return page.getByRole('heading', { level: 1 })
}

test.describe('My Membership', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await setFeatureFlags(page, { memberships: true })
  })

  test('displays page heading', async ({ page }) => {
    const heading = await getMembershipPageHeading(page)

    await expect(heading).toContainText('Membership')
  })

  test('shows active membership status for test user', async ({ page }) => {
    await getMembershipPageHeading(page)

    // Test user has a seeded "pro" membership
    await expect(page.getByTestId('membership-plan-name')).toContainText(/pro Plan/i)
    await expect(page.getByTestId('membership-status-badge')).toContainText('active')
  })

  test('requires login - redirects to login when not authenticated', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/membership')

    // When not logged in, /my/ pages should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})
