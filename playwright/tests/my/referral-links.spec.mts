import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

test.describe('My Referral Links', () => {
  test.use({ storageState: AUTH_STATE })

  test('displays page heading and subtitle', async ({ page }) => {
    await navigateTo(page, '/my/referral-links')

    await expect(page.getByTestId('settings-page-header-title')).toContainText('Referral Links')
    await expect(page.getByTestId('settings-page-header-description')).toContainText(
      'referral links',
    )
  })

  test('shows referral program search autocomplete', async ({ page }) => {
    await navigateTo(page, '/my/referral-links')

    await expect(page.getByTestId('add-referral-link-heading')).toBeVisible()
    const input = page.getByTestId('topic-autocomplete-input')
    await expect(input).toBeVisible()
    await expect(input).toHaveAccessibleName('Search referral programs')
  })

  test('settings nav is not shown on referral-links page', async ({ page }) => {
    await navigateTo(page, '/my/referral-links')

    // Referral Links is a standalone page, not part of settings nav tab groups
    await expect(page.getByTestId('settings-nav-account-tab')).toBeHidden()
  })

  test('responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/my/referral-links')

    await expect(page.getByTestId('settings-page-header-title')).toContainText('Referral Links')

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })

  test('resize stability from desktop to mobile', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/my/referral-links')

    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasHorizontalScroll).toBe(false)
  })
})
