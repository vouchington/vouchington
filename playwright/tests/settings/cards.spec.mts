import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('Cards Settings Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/cards')
    await expect(page).toHaveURL('/login')
  })

  test.describe('authenticated', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      await navigateTo(page, '/my/cards')
    })

    test('add form is always visible without clicking any button', async ({ page }) => {
      await expect(page.getByTestId('cards-add-form-heading')).toBeVisible()
    })

    test('cards settings page renders the add form', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByTestId('cards-add-form-heading')).toBeVisible()
    })
  })
})
