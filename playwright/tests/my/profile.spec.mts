import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('My Profile', () => {
  test.use({ storageState: AUTH_STATE })

  test('displays page heading', async ({ page }) => {
    await navigateTo(page, '/my/profile')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Profile')
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/profile')
    await expect(page).toHaveURL('/login')
  })

  test('shows error toast when profile markdown contains a blocked domain', async ({ page }) => {
    await navigateTo(page, '/my/profile')

    const textarea = page.locator('textarea#markdown')
    await textarea.fill('')
    await textarea.pressSequentially('Check out https://blocked-site.com for more info.')

    await page.getByTestId('profile-save-button').click()

    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible({
      timeout: 5000,
    })
  })
})
