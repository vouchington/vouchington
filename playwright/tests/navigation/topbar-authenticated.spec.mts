import { test, expect } from '../../helpers/test.mts'
import { loginAsTestUser, TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

test.describe('Topbar - authenticated', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows profile avatar button instead of Sign In', async ({ page }) => {
    await navigateTo(page, '/')

    // Sign In should not exist for authenticated users
    await expect(page.getByTestId('navbar-signin-link')).toHaveCount(0)

    // Avatar button should be visible with its accessible name
    await expect(page.getByTestId('navbar-profile-menu-button')).toBeVisible()
  })

  test('profile avatar shows user initials', async ({ page }) => {
    await navigateTo(page, '/')

    const avatarButton = page.getByTestId('navbar-profile-menu-button')
    await expect(avatarButton).toBeVisible()
    const expectedInitials = TEST_USER_USERNAME.slice(0, 2).toUpperCase()
    await expect(avatarButton).toContainText(expectedInitials)
  })

  test('profile dropdown opens on avatar click', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-profile-menu-button').click()

    // Dropdown menu should appear
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
  })

  test('profile dropdown contains expected menu items', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-profile-menu-button').click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    await expect(page.getByTestId('profile-menu-profile')).toBeVisible()
    await expect(page.getByTestId('profile-menu-identity')).toBeVisible()
    await expect(page.getByTestId('profile-menu-preferences')).toBeVisible()
    await expect(page.getByTestId('profile-menu-signout')).toBeVisible()
  })

  test('profile dropdown navigates to profile page', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-profile-menu-button').click()

    await page.getByTestId('profile-menu-profile').click()
    await expect(page).toHaveURL(/\/my\/profile/)
  })

  test('profile dropdown navigates to preferences page', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-profile-menu-button').click()

    await page.getByTestId('profile-menu-preferences').click()
    await expect(page).toHaveURL(/\/my\/preferences/)
  })

  test('profile dropdown header shows avatar and links to public profile', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-profile-menu-button').click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()

    const headerLink = page.getByTestId('profile-menu-current-user')
    await expect(headerLink).toBeVisible()
    await expect(headerLink).toHaveAttribute('href', `/user/${TEST_USER_USERNAME}`)
    await expect(headerLink.getByTestId('user-avatar')).toBeVisible()
    await expect(headerLink).toContainText(TEST_USER_USERNAME)
  })

  test('profile dropdown header navigates to public profile on click', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-profile-menu-button').click()

    await page.getByTestId('profile-menu-current-user').click()
    await expect(page).toHaveURL(new RegExp(`/user/${TEST_USER_USERNAME}`))
  })

  test('sign out from profile dropdown reloads the current public page', async ({ page }) => {
    // Real logout revokes the session server-side. Use a fresh isolated login
    // (random device id) instead of the shared AUTH_STATE so this logout cannot
    // break other tests that reuse the captured session.
    await page.context().clearCookies()
    await loginAsTestUser(page)
    await navigateTo(page, '/plans')
    const cookiesBeforeLogout = await page.context().cookies()
    const authenticatedSessionCookie = requireTestValue(
      cookiesBeforeLogout.find(cookie => cookie.name === 'st'),
      'Authenticated user must have an st session cookie before logout',
    )

    await page.getByTestId('navbar-profile-menu-button').click()

    await page.getByTestId('profile-menu-signout').click()
    await expect(page).toHaveURL('/plans')
    await expect(page.getByTestId('navbar-profile-menu-button')).toHaveCount(0)
    await expect(page.getByTestId('navbar-signin-link')).toBeVisible()

    const cookiesAfterLogout = await page.context().cookies()
    const signedOutSessionCookie = cookiesAfterLogout.find(cookie => cookie.name === 'st')
    // Logout may either clear st or be followed by an anonymous edge-minted st.
    expect(signedOutSessionCookie?.value).not.toBe(authenticatedSessionCookie.value)

    await page.reload()
    await expect(page).toHaveURL('/plans')
    await expect(page.getByTestId('navbar-profile-menu-button')).toHaveCount(0)
    await expect(page.getByTestId('navbar-signin-link')).toBeVisible()
  })

  test('sign out from profile dropdown shows an error toast when logout fails', async ({
    page,
  }) => {
    await navigateTo(page, '/plans')

    await page.route('**/api/v1/auth/logout', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Logout unavailable' }),
      }),
    )

    await page.getByTestId('navbar-profile-menu-button').click()

    await page.getByTestId('profile-menu-signout').click()

    await expect(page).toHaveURL('/plans')
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Logout unavailable' }),
    ).toBeVisible()
  })

  test('Write button is visible for authenticated users', async ({ page }) => {
    await navigateTo(page, '/')

    const writeButton = page.getByTestId('navbar-write-button')
    await expect(writeButton).toBeVisible()
  })

  test('Write button is borderless on mobile and desktop', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/')

    const writeButton = page.getByTestId('navbar-write-button')
    await expect(writeButton).toBeVisible()
    const mobileBox = await writeButton.boundingBox()
    expect(mobileBox).not.toBeNull()
    expect(mobileBox!.height).toBeGreaterThanOrEqual(44)
    await expect(writeButton).toHaveCSS('border-top-width', '0px')

    await page.setViewportSize(DESKTOP_VIEWPORT)
    await expect(writeButton).toHaveCSS('border-top-width', '0px')
  })

  test('Write button opens dialog with navigation options', async ({ page }) => {
    await navigateTo(page, '/')

    await page.getByTestId('navbar-write-button').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('write-dialog-link-discussions-create')).toBeVisible()
    await expect(page.getByTestId('write-dialog-link-reviews-create')).toBeVisible()
    await expect(page.getByTestId('write-dialog-link-data-points-create')).toBeVisible()
  })

  test('shows Messages icon link in navbar', async ({ page }) => {
    await navigateTo(page, '/')

    const messagesLink = page.getByTestId('navbar-messages-link')
    await expect(messagesLink).toBeVisible()
    await expect(messagesLink).toHaveAttribute('href', '/messages')
  })

  test('shows intent switcher dropdown trigger', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/')

    // Scope to the navbar (there are two intent-switcher-trigger elements: one in navbar, one in sidebar)
    const navbar = page.locator('nav[aria-label="Main"]')
    const switcherTrigger = navbar.getByTestId('intent-switcher-trigger')
    await expect(switcherTrigger).toBeVisible()
  })
})
