import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

test.describe('Home Page Redirect', () => {
  test.use({ storageState: AUTH_STATE })

  test('authenticated user is redirected from / to /feed/news', async ({ page }) => {
    await navigateTo(page, '/')

    await expect(page).toHaveURL(/\/feed\/news/)
  })

  test('signed-out user sees the landing page', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')

    await expect(page).not.toHaveURL(/\/feed/)
    await expect(page.getByTestId('landing-hero-heading')).toBeVisible()
  })

  test('signed-out landing page has top communities and referral programs sections', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/')

    await expect(page.getByRole('heading', { level: 2, name: /top communities/i })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: /top referral programs/i }),
    ).toBeVisible()

    // A null payload renders neither id, so a failed load cannot satisfy this assertion.
    await expect(
      page.getByTestId('top-communities').or(page.getByTestId('top-communities-empty')),
    ).toBeVisible()
    await expect(
      page.getByTestId('top-referral-programs').or(page.getByTestId('top-referral-programs-empty')),
    ).toBeVisible()
  })
})
