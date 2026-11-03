import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, waitForBelowFoldHydration } from 'vouchington-tooling/playwright'

test.describe('Preferences Page', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.context().clearCookies({ name: 'theme' })
    await page.context().clearCookies({ name: 'list-style' })
    // Set theme to 'system' so tests start from a neutral, predictable state
    // regardless of DEFAULT_THEME. Without this, the handleThemeChange early-return
    // ('value === theme') would prevent theme-change assertions from working when
    // DEFAULT_THEME matches the option being clicked.
    //
    // Use addInitScript with a guard (not bare page.evaluate) so this runs before
    // the first page load even when storageState leaves the page at about:blank,
    // while the guard (`!localStorage.getItem('theme')`) prevents it from resetting
    // a value the test itself set (e.g. 'dark') when page.reload() runs.
    await page.addInitScript(() => {
      if (!localStorage.getItem('theme')) {
        localStorage.setItem('theme', 'system')
      }
    })
    await navigateTo(page, '/my/preferences')
    await waitForBelowFoldHydration(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Display')
  })

  test('renders theme and list style selects', async ({ page }) => {
    await expect(page.getByTestId('preferences-theme-trigger')).toBeVisible()
    await expect(page.getByTestId('preferences-list-style-trigger')).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // New page with no auth cookies
    await page.context().clearCookies()
    await navigateTo(page, '/my/preferences')
    await expect(page).toHaveURL('/login')
  })

  test('theme select changes to light and removes .dark class from html', async ({ page }) => {
    const themeSelect = page.getByTestId('preferences-theme-trigger')
    await themeSelect.press(' ')
    await page.getByTestId('preferences-theme-option-dark').click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await themeSelect.press(' ')
    await page.getByTestId('preferences-theme-option-light').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('theme preference persists after page reload', async ({ page }) => {
    const themeSelect = page.getByTestId('preferences-theme-trigger')
    await themeSelect.press(' ')
    await page.getByTestId('preferences-theme-option-dark').click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(themeSelect).toContainText('Dark')
  })

  test('list style preference persists after page reload', async ({ page }) => {
    const listStyleSelect = page.getByTestId('preferences-list-style-trigger')
    await listStyleSelect.press(' ')
    await page.getByTestId('preferences-list-style-option-compact').click()

    await page.reload()
    await expect(listStyleSelect).toContainText('Compact')
  })
})
