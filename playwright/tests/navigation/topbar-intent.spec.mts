import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

test.describe('Topbar - intent navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/')
  })

  test('intent items are links with href attributes', async ({ page }) => {
    const navbar = page.getByTestId('navbar')
    await navbar.getByTestId('intent-switcher-trigger').click()
    // Requirement: navigation dropdown items must be anchors, not buttons
    const newsItem = page.getByTestId('intent-switcher-item-news')
    await expect(newsItem).toHaveAttribute('href', '/news')
  })

  test('referral-links intent item links to /referral-programs for unauthenticated users', async ({
    page,
  }) => {
    const navbar = page.getByTestId('navbar')
    await navbar.getByTestId('intent-switcher-trigger').click()
    await expect(page.getByTestId('intent-switcher-item-referral-links')).toHaveAttribute(
      'href',
      '/referral-programs',
    )
    await page.getByTestId('intent-switcher-item-referral-links').click()
    await expect(page).toHaveURL('/referral-programs')
  })
})

test.describe('Topbar - intent navigation (authenticated)', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/')
  })

  test('referral-links intent item links to /feed/referral-links for authenticated users', async ({
    page,
  }) => {
    const navbar = page.getByTestId('navbar')
    await navbar.getByTestId('intent-switcher-trigger').click()
    await expect(page.getByTestId('intent-switcher-item-referral-links')).toHaveAttribute(
      'href',
      '/feed/referral-links',
    )
    await page.getByTestId('intent-switcher-item-referral-links').click()
    await expect(page).toHaveURL('/feed/referral-links')
  })
})
