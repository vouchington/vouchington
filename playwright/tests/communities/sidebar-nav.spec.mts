import { test, expect, type Locator } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

/**
 * Communities sidebar navigation tests.
 * Verifies sidebar links for the communities intent appear correctly.
 *
 * Architecture: CommunitiesSidebarGroup (with sidebar-explore-communities-link
 * and sidebar-create-community-link) only renders when activeIntentId === 'communities'
 * AND isAuthenticated. Anonymous users see sidebar-nav-explore from the Browse group.
 */

test.describe('Communities Sidebar Navigation', () => {
  // Shared sidebar locator — scoped to avoid matching community links that
  // contain "Explore Communities" as a substring
  let sidebar: Locator

  test.beforeEach(({ page }) => {
    sidebar = page.locator('[data-sidebar="sidebar"]')
  })

  test.describe('anonymous', () => {
    // Clear auth cookies (not storageState) so cookie-consent localStorage stays set.
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('unauthenticated sidebar shows Explore Communities link on /communities', async ({
      page,
    }) => {
      await navigateTo(page, '/communities')
      await expect(sidebar.getByTestId('sidebar-nav-explore')).toBeVisible()
    })

    test('Explore Communities link has correct href', async ({ page }) => {
      await navigateTo(page, '/communities')
      await expect(sidebar.getByTestId('sidebar-nav-explore')).toHaveAttribute(
        'href',
        '/communities',
      )
    })

    test('unauthenticated sidebar does not show Create Community link', async ({ page }) => {
      await navigateTo(page, '/communities')
      await expect(sidebar.getByTestId('sidebar-create-community-link')).toBeHidden()
    })
  })

  test.describe('authenticated', () => {
    test.use({ storageState: AUTH_STATE })

    test('authenticated sidebar shows Explore group with Explore Communities link', async ({
      page,
    }) => {
      // CommunitiesSidebarGroup only renders in the communities intent
      await navigateTo(page, '/communities')
      await expect(sidebar.getByTestId('sidebar-group-communities-explore')).toBeVisible()
      await expect(sidebar.getByTestId('sidebar-explore-communities-link')).toBeVisible()
    })

    test('Explore Communities link is active on /communities', async ({ page }) => {
      await navigateTo(page, '/communities')
      const communitiesLink = sidebar.getByTestId('sidebar-explore-communities-link')
      await expect(communitiesLink).toBeVisible()
      await expect(communitiesLink).toHaveAttribute('href', '/communities')
      await expect(communitiesLink).toHaveAttribute('data-active', 'true')
    })

    test('authenticated sidebar shows Create Community link on /communities', async ({ page }) => {
      // CommunitiesSidebarGroup only renders in the communities intent
      await navigateTo(page, '/communities')
      const link = sidebar.getByTestId('sidebar-create-community-link')
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', '/communities/create')
    })

    test('Create Community link navigates to /communities/create', async ({ page }) => {
      await navigateTo(page, '/communities')
      await sidebar.getByTestId('sidebar-create-community-link').click()
      await expect(page).toHaveURL('/communities/create')
    })

    test('authenticated sidebar shows My Communities group (seeded user is a member)', async ({
      page,
    }) => {
      // The seeded AUTH_STATE user is a member of playwright-popular-community
      await navigateTo(page, '/communities')
      await expect(sidebar.getByTestId('sidebar-group-my-communities')).toBeVisible()
    })

    test('authenticated sidebar does not show static sidebar-nav-explore on communities intent', async ({
      page,
    }) => {
      // Static Browse group is suppressed when authenticated on the communities intent
      // to avoid the duplicate Explore link (#5798)
      await navigateTo(page, '/communities')
      await expect(sidebar.getByTestId('sidebar-nav-explore')).toBeHidden()
    })
  })
})
