/**
 * Tests that the right aside column is internally scrollable when content
 * exceeds viewport height. Uses a short viewport to force overflow.
 */
import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Short enough that the aside (about + dynamic discovery sections) overflows.
const SHORT_VIEWPORT = { width: 1280, height: 320 }

test.describe('Aside column scroll', () => {
  test('aside column scrolls internally when content exceeds viewport height', async ({ page }) => {
    await page.setViewportSize(SHORT_VIEWPORT)
    await navigateTo(page, '/')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()

    // The Radix ScrollArea viewport must be scrollable when content overflows
    const scrollable = await aside.evaluate(el => {
      const viewport = el.querySelector('[data-radix-scroll-area-viewport]')
      if (!viewport) return { found: false, canScroll: false, scrollHeight: 0, clientHeight: 0 }
      return {
        found: true,
        canScroll: viewport.scrollHeight > viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
      }
    })

    expect(scrollable.found).toBe(true)
    expect(scrollable.canScroll).toBe(true)

    // Verify scrollTop actually changes after scrolling
    await aside.evaluate(el => {
      const viewport = el.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) viewport.scrollTop = 100
    })
    const scrollTop = await aside.evaluate(el => {
      const viewport = el.querySelector('[data-radix-scroll-area-viewport]')
      return viewport?.scrollTop ?? 0
    })
    expect(scrollTop).toBeGreaterThan(0)
  })
})
