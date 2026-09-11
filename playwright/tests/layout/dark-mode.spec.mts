import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

test.describe('Dark mode - no hardcoded colors', () => {
  test.use({ storageState: AUTH_STATE })

  test('discussions page renders correctly in dark mode', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)

    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
    })

    await navigateTo(page, '/discussions')

    // No elements should have bg-white class visible in the main content
    const bgWhiteCount = await page.evaluate(() => {
      const elements = document.querySelectorAll('.bg-white')
      return [...elements].filter(el => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }).length
    })
    expect(bgWhiteCount, 'No visible elements should use bg-white in dark mode').toBe(0)
  })

  test('aside renders correctly in dark mode', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    // Enable dark mode after navigation
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
    })

    // Cards in aside should use semantic bg-card, not bg-white
    const asideCards = page.locator('main aside .rounded-md')
    await expect(asideCards.first()).toBeVisible()
    const cardCount = await asideCards.count()
    expect(cardCount).toBeGreaterThan(0)

    const bgColors = await asideCards.evaluateAll(els =>
      els.map(el => window.getComputedStyle(el).backgroundColor),
    )
    for (const [i, bgColor] of bgColors.entries()) {
      // In dark mode, bg-card should NOT be white (rgb(255, 255, 255))
      expect(bgColor, `Card ${i} should not have white background in dark mode`).not.toBe(
        'rgb(255, 255, 255)',
      )
    }
  })
})
