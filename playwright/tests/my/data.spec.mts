import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('My Data', () => {
  test.use({ storageState: AUTH_STATE })

  test('displays data management page', async ({ page }) => {
    await navigateTo(page, '/my/data')
    await page.waitForLoadState('load')

    await expect(page.getByTestId('delete-account-section-heading')).toBeVisible()
  })

  test('shows export and delete account privacy controls', async ({ page }) => {
    await navigateTo(page, '/my/data')

    await expect(page.getByTestId('data-export-section-heading')).toBeVisible()
    await page.getByTestId('delete-account-open-dialog').click()
    await expect(page.getByTestId('delete-account-dialog-description')).toBeVisible()
    await expect(page.getByTestId('delete-account-confirmation-input')).toBeVisible()
    await expect(page.getByTestId('delete-account-confirm-button')).toBeDisabled()
    await page.getByTestId('delete-account-cancel-button').click()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/data')
    await expect(page).toHaveURL('/login')
  })
})
