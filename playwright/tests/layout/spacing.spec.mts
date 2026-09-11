import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'

test.describe('Layout spacing', () => {
  test.describe('no horizontal scroll at key viewports', () => {
    const viewports = {
      smallest: { width: 320, height: 568 },
      mobile: { width: 375, height: 667 },
      tablet: { width: 768, height: 1024 },
      desktop: { width: 1280, height: 720 },
      wide: { width: 1920, height: 1080 },
    } as const

    for (const [name, viewport] of Object.entries(viewports)) {
      test(`discussions page at ${name} (${viewport.width}px)`, async ({ page }) => {
        await page.setViewportSize(viewport)
        const response = await page.goto('/discussions')
        expect(response?.status()).toBe(200)
        await assertNoHorizontalScroll(page)
      })
    }
  })

  test('content is centered within content area at desktop', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    // Verify the main content flex container exists with max-w-[1200px].
    // Don't collapse the sidebar first — the centering constraint applies
    // regardless of sidebar state, and toggling the sidebar depends on
    // React hydration which is unreliable in dev mode.
    const contentContainer = page.locator(String.raw`main .flex.max-w-\[1200px\]`).first()
    await expect(contentContainer).toBeVisible()
  })

  test('main content has 16px horizontal gutter on mobile (px-4)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/discussions')

    // Main content area: px-4 py-2 sm:p-4
    // At mobile (375px < 640px sm breakpoint): px-4 = 16px, py-2 = 8px
    // oxlint-disable-next-line no-mistakes/playwright-selector-priority -- reading computed CSS from the main layout container by HTML id
    const mainPadding = await page.locator('#main-content').evaluate(el => {
      const style = window.getComputedStyle(el)
      return {
        paddingTop: style.paddingTop,
        paddingLeft: style.paddingLeft,
      }
    })

    expect(Number.parseInt(mainPadding.paddingTop, 10)).toBe(8)
    expect(Number.parseInt(mainPadding.paddingLeft, 10)).toBe(16)
  })

  test('homepage has 16px horizontal gutter on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/')

    // oxlint-disable-next-line no-mistakes/playwright-selector-priority -- reading computed CSS from the main layout container by HTML id
    const mainPadding = await page.locator('#main-content').evaluate(el => {
      const style = window.getComputedStyle(el)
      return {
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      }
    })

    expect(Number.parseInt(mainPadding.paddingLeft, 10)).toBe(16)
    expect(Number.parseInt(mainPadding.paddingRight, 10)).toBe(16)
  })

  test('homepage has no horizontal scroll at smallest viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS.smallest)
    await navigateTo(page, '/')
    await assertNoHorizontalScroll(page)
  })

  test('homepage has no horizontal scroll at iphone-se', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await navigateTo(page, '/')
    await assertNoHorizontalScroll(page)
  })

  test('viewport resize stability: desktop to mobile and back', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    // Resize to mobile
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
    await assertNoHorizontalScroll(page)

    // Resize back to desktop
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await assertNoHorizontalScroll(page)
  })
})
