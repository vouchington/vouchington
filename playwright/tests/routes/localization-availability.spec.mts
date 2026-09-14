import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('route localization availability', () => {
  test('login renders in English without a browser error', async ({ page }) => {
    await navigateTo(page, '/login')
    await expect(page.getByTestId('localization-login-page')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test.describe('admin', () => {
    test.use({ storageState: AUTH_STATE })

    test('AI costs renders in English without a browser error', async ({ page }) => {
      await navigateTo(page, '/admin/ai-costs')
      await expect(page.getByTestId('localization-admin-ai-costs-page')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })

    test('growth dashboard renders in English without a browser error', async ({ page }) => {
      await navigateTo(page, '/growth')
      await expect(page.getByTestId('localization-growth-dashboard')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })
  })
})
