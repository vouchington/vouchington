import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'
import { withCleanUser } from '../../helpers/auth.mts'

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

  test('shows profile link add, row and edit controls', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/my/profile')

    await page.getByTestId('profile-links-add-link').click()
    await expect(page.getByTestId('profile-link-form-cancel')).toBeVisible()
    await page
      .getByLabel('URL', { exact: true })
      .pressSequentially(`https://www.python.org/pw-${randomSuffix()}`)
    await page.getByTestId('profile-link-form-submit').click()

    await expect(page.getByTestId('profile-link-row-move-up')).toBeAttached()
    await expect(page.getByTestId('profile-link-row-move-down')).toBeAttached()
    await expect(page.getByTestId('profile-link-row-delete')).toBeVisible()
    await page.getByTestId('profile-link-row-edit').click()
    await expect(page.getByTestId('profile-link-form-submit')).toBeVisible()
  })
})
