import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Settings Nav Tabs', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await navigateTo(page, '/my/identity')
  })

  test('renders four tabs: Account, Profile, Preferences, Advanced', async ({ page }) => {
    await expect(page.getByTestId('settings-nav-account-tab')).toBeVisible()
    await expect(page.getByTestId('settings-nav-profile-tab')).toBeVisible()
    await expect(page.getByTestId('settings-nav-preferences-tab')).toBeVisible()
    await expect(page.getByTestId('settings-nav-advanced-tab')).toBeVisible()
  })

  test('Account tab is active on /my/identity', async ({ page }) => {
    await expect(page.getByTestId('settings-nav-account-tab')).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('Account dropdown contains Identity, Privacy, Membership', async ({ page }) => {
    await page.getByTestId('settings-nav-account-tab').click()
    await expect(page.getByTestId('settings-nav-dropdown-identity')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-privacy')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-membership')).toBeVisible()
  })

  test('Account dropdown does not contain About Me (moved to Profile)', async ({ page }) => {
    await page.getByTestId('settings-nav-account-tab').click()
    await expect(page.getByTestId('settings-nav-dropdown-about-me')).toHaveCount(0)
  })

  test('Profile tab activates on /my/profile (About Me)', async ({ page }) => {
    await navigateTo(page, '/my/profile')
    await expect(page.getByTestId('settings-nav-profile-tab')).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('Profile dropdown contains About Me and card items', async ({ page }) => {
    await navigateTo(page, '/my/profile')
    await page.getByTestId('settings-nav-profile-tab').click()
    await expect(page.getByTestId('settings-nav-dropdown-about-me')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-cards')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-household')).toBeVisible()
  })

  test('Preferences tab activates on /my/preferences', async ({ page }) => {
    await navigateTo(page, '/my/preferences')
    await expect(page.getByTestId('settings-nav-preferences-tab')).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('Preferences dropdown contains Display and News', async ({ page }) => {
    await navigateTo(page, '/my/preferences')
    await page.getByTestId('settings-nav-preferences-tab').click()
    await expect(page.getByTestId('settings-nav-dropdown-display')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-news')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-import-export')).toHaveCount(0)
  })

  test('Preferences tab activates on /my/news-preferences', async ({ page }) => {
    await navigateTo(page, '/my/news-preferences')
    await expect(page.getByTestId('settings-nav-preferences-tab')).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('Advanced dropdown contains API Keys, Connected Apps, Your Data', async ({ page }) => {
    await page.getByTestId('settings-nav-advanced-tab').click()
    await expect(page.getByTestId('settings-nav-dropdown-api-keys')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-connected-apps')).toBeVisible()
    await expect(page.getByTestId('settings-nav-dropdown-find-friends')).toHaveCount(0)
    await expect(page.getByTestId('settings-nav-dropdown-your-data')).toBeVisible()
  })

  test('clicking Advanced tab navigates to /my/api-keys', async ({ page }) => {
    await page.getByTestId('settings-nav-advanced-tab').click()
    await page.getByTestId('settings-nav-dropdown-api-keys').click()
    await expect(page).toHaveURL(/\/my\/api-keys$/)
  })

  test('no Preferences sub-items directly visible as second row', async ({ page }) => {
    // With dropdown-only nav, there's no second pill row of links
    await expect(page.getByTestId('settings-nav-link-preferences')).toHaveCount(0)
    await expect(page.getByTestId('settings-nav-link-api-keys')).toHaveCount(0)
  })

  test('Landing Pages is not shown in settings nav', async ({ page }) => {
    await expect(page.getByTestId('settings-nav-dropdown-landing-pages')).toHaveCount(0)
  })

  test('mobile: tabs are visible and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, '/my/identity')

    const menubar = page.getByRole('menubar', { name: 'Settings groups' })
    await expect(menubar).toBeVisible()
    await expect(page.getByTestId('settings-nav-account-tab')).toBeVisible()
    await expect(page.getByTestId('settings-nav-advanced-tab')).toBeAttached()
  })
})
