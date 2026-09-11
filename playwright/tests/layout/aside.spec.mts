import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'

const LG_VIEWPORT = { width: 1024, height: 768 }

test.describe('Right-side aside', () => {
  test('aside is visible at lg viewport (1024px)', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()
  })

  test('aside is hidden below lg viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORTS['iphone-14-pro'])
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeHidden()
  })

  test('aside is hidden at tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeHidden()
  })

  test('post listing pages do not embed the login form for logged-out users', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()
    await expect(aside.getByTestId('login-form-heading')).toBeHidden()
    await expect(aside.getByTestId('login-email-input')).toBeHidden()
    await expect(aside.getByTestId('aside-accordion-about-voucha-trigger')).toBeVisible()
  })

  test('desktop: aside content is scrollable when taller than viewport', async ({ page }) => {
    // Use a short viewport to force the aside to overflow
    await page.setViewportSize({ width: 1280, height: 400 })
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()

    // The ScrollArea uses h-[...] (definite height) so Radix Viewport's h-full resolves.
    // scrollHeight > clientHeight on the Viewport (not the Root) confirms scrollability.
    // The Root has scrollHeight === clientHeight since it clips; overflow lives in the Viewport.
    const viewport = aside.locator('[data-radix-scroll-area-viewport]')
    await expect(viewport).toBeVisible()

    const isScrollable = await viewport.evaluate(el => el.scrollHeight > el.clientHeight)
    expect(isScrollable).toBe(true)
  })
})
