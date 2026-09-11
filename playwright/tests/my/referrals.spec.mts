import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

test.describe('My Referrals', () => {
  test.use({ storageState: AUTH_STATE })

  test('shows referrals page with heading and empty state', async ({ page }) => {
    await navigateTo(page, '/my/referrals')

    await expect(page.getByTestId('referrals-page-heading')).toBeVisible()
    await expect(page.getByTestId('referrals-page-description')).toBeVisible()
  })

  test('settings nav is not shown on referrals page', async ({ page }) => {
    await navigateTo(page, '/my/referrals')

    // Referrals is a standalone page, not part of settings nav tab groups
    await expect(page.getByTestId('settings-nav-account-tab')).toBeHidden()
  })
})
