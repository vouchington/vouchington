import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.describe('Cards Settings Page', () => {
  test.use({ storageState: AUTH_STATE })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/my/cards')
    await expect(page).toHaveURL('/login')
  })
})
