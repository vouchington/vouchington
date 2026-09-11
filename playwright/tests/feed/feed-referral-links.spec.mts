import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { withCleanUser } from '../../helpers/auth.mts'

// The seeded test user follows test-friend (00000000-...-001).
// test-friend has an active referral link on chase-sapphire-referral (seeded in
// post-referrals-and-landing-pages.mts), so the feed always has at least one card.

test.describe('/feed/referral-links', () => {
  test.use({ storageState: AUTH_STATE })

  test('renders with referral link feed cards', async ({ page }) => {
    await navigateTo(page, '/feed/referral-links')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Referral Link Feed')
    await expect(page.getByTestId('feed-title-dropdown-trigger')).toBeVisible()
    // The seeded test-friend referral link should appear
    await expect(page.getByTestId('referral-link-feed-card').first()).toBeVisible()
  })

  test('sub-filter dropdown switches between Following and Mutual Friends', async ({ page }) => {
    await navigateTo(page, '/feed/referral-links')
    await expect(page).toHaveURL('/feed/referral-links')
    const subFilter = page.getByTestId('feed-sub-filter-trigger')
    await expect(subFilter).toContainText('Following')

    await subFilter.click()
    const menu = page.getByRole('menu')
    await menu.getByRole('menuitem', { name: 'Mutual Friends' }).click()
    await expect(page).toHaveURL('/feed/referral-links/mutual')
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Mutual Friends')
  })

  test('mutual sub-filter is accessible directly', async ({ page }) => {
    await navigateTo(page, '/feed/referral-links/mutual')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Referral Link Feed')
    await expect(page.getByTestId('feed-sub-filter-trigger')).toContainText('Mutual Friends')
  })

  test.describe('anonymous', () => {
    test.beforeEach(async ({ page }) => {
      await page.context().clearCookies()
    })

    test('redirects to /login when not authenticated', async ({ page }) => {
      await navigateTo(page, '/feed/referral-links')
      await expect(page).toHaveURL(/\/login/)
    })
  })
})

test.describe('/feed/referral-links empty state', () => {
  test('shows empty state when the viewer has no follows', async ({ page }) => {
    await withCleanUser(page)
    await navigateTo(page, '/feed/referral-links')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Referral Link Feed')
    // Clean user has no follows → empty state; feed card should not appear
    await expect(page.getByTestId('referral-link-feed-card')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Find Friends/i })).toBeVisible()
  })
})
