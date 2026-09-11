/**
 * Sticky header tests.
 *
 * The navbar must remain fixed at the top of the viewport when users scroll the page.
 * This applies on all viewport sizes.
 */
import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

test.describe('Sticky header', () => {
  test('navbar stays visible after scrolling at desktop viewport', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    // Scroll down significantly
    await page.evaluate(() => window.scrollTo(0, 500))

    const navbarTop = await page
      .locator('nav')
      .first()
      .evaluate(el => {
        return el.getBoundingClientRect().top
      })

    // Sticky nav should be at or near the top of the viewport
    expect(navbarTop).toBeLessThanOrEqual(0)
    expect(navbarTop).toBeGreaterThanOrEqual(-2) // allow 2px for sub-pixel rendering
  })

  test('navbar stays visible after scrolling at mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/discussions')

    await page.evaluate(() => window.scrollTo(0, 500))

    const navbarTop = await page
      .locator('nav')
      .first()
      .evaluate(el => {
        return el.getBoundingClientRect().top
      })

    expect(navbarTop).toBeLessThanOrEqual(0)
    expect(navbarTop).toBeGreaterThanOrEqual(-2)
  })

  test('navbar has sticky positioning and z-index above sidebar content', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    const navStyles = await page
      .locator('nav')
      .first()
      .evaluate(el => {
        const style = window.getComputedStyle(el)
        return { position: style.position, zIndex: style.zIndex, top: style.top }
      })

    expect(navStyles.position).toBe('sticky')
    expect(navStyles.top).toBe('0px')
    // z-index should be 30 (above SidebarInset z-10, below dialogs z-50)
    expect(Number.parseInt(navStyles.zIndex, 10)).toBeGreaterThanOrEqual(20)
  })
})
