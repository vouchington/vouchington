import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

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

    const communitiesSection = page.getByTestId('top-communities')
    const referralProgramsSection = page.getByTestId('top-referral-programs')

    await expect(
      communitiesSection
        .or(page.getByText('No communities yet.'))
        .or(page.getByText('Unable to load communities.')),
    ).toBeVisible()
    await expect(
      referralProgramsSection
        .or(page.getByText('No referral programs yet.'))
        .or(page.getByText('Unable to load referral programs.')),
    ).toBeVisible()
  })
})
