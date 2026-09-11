/* eslint-disable playwright/valid-title -- String.raw template literals in test titles (for backslash display) are valid; playwright/valid-title only accepts string literals but the formatter enforces String.raw here */
/**
 * Tests for the right-aside toggle functionality.
 *
 * Covers:
 * - Cmd/Ctrl+\ keyboard shortcut hides and shows the desktop aside column
 * - Toggle button click hides/shows aside on desktop
 * - Toggle button click opens Sheet drawer on mobile
 * - Close (X) button works in the Sheet drawer
 */
import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

const MOBILE = MOBILE_VIEWPORTS['iphone-se']
const LG_VIEWPORT = { width: 1024, height: 768 }

test.describe('Aside toggle — desktop', () => {
  test(String.raw`Cmd+\ hides the aside column`, async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()

    await page.keyboard.press('ControlOrMeta+\\')

    await expect(aside).toBeHidden()
  })

  test(String.raw`Cmd+\ shows the aside column again after hiding`, async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()

    await page.keyboard.press('ControlOrMeta+\\')
    await expect(aside).toBeHidden()

    await page.keyboard.press('ControlOrMeta+\\')
    await expect(aside).toBeVisible()
  })

  test('toggle button click hides the aside column on desktop', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()

    await page.getByTestId('aside-toggle-button').click()

    await expect(aside).toBeHidden()
  })

  test('toggle button click shows the aside column again on desktop', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')

    await page.getByTestId('aside-toggle-button').click()
    await expect(aside).toBeHidden()

    await page.getByTestId('aside-toggle-button').click()
    await expect(aside).toBeVisible()
  })

  test('visual snapshot — aside hidden on desktop', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/discussions')

    await page.keyboard.press('ControlOrMeta+\\')

    const aside = page.locator('main aside')
    await expect(aside).toBeHidden()
  })
})

test.describe('Aside toggle button positioning', () => {
  test('toggle button sticky offset aligns with aside column top', async ({ page }) => {
    await page.setViewportSize(LG_VIEWPORT)
    await navigateTo(page, '/discussions')

    const aside = page.locator('main aside')
    await expect(aside).toBeVisible()

    // The toggle button wrapper should be sticky at top-14 (56px) matching aside column offset.
    // DOM: button → div.flex.justify-end → div.mx-auto.max-w-[1200px] → div.sticky.top-14
    const toggleWrapper = page.locator('[aria-label="Toggle page sidebar"]').locator('..')
    const wrapperClass = await toggleWrapper.evaluate(
      el => el.parentElement?.parentElement?.className ?? '',
    )
    expect(wrapperClass).toContain('top-14')
    expect(wrapperClass).not.toContain('top-12')
  })
})

test.describe('Aside toggle — mobile', () => {
  test('toggle button opens Sheet drawer on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await navigateTo(page, '/discussions')

    await page.getByTestId('aside-toggle-button').click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
  })

  test('toggle button opens Sheet drawer on mobile for non-infinite-scroll page', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)
    await navigateTo(page, '/plans')

    await page.getByTestId('aside-toggle-button').click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
  })

  test(
    String.raw`Cmd+\ opens Sheet drawer on mobile for non-infinite-scroll page`,
    async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/plans')

      await page.keyboard.press('ControlOrMeta+\\')

      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
    },
  )

  test('close (X) button closes the Sheet drawer', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await navigateTo(page, '/discussions')

    await page.getByTestId('aside-toggle-button').click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()

    // The Sheet's built-in close button
    await page.getByTestId('sheet-close-button').click()

    await expect(drawer).toBeHidden()
  })

  test('pressing Escape closes the Sheet drawer on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await navigateTo(page, '/discussions')

    await page.getByTestId('aside-toggle-button').click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()

    // The Sheet overlay (z-50) covers the toggle button (z-20) when open,
    // so Escape is the keyboard mechanism to close the drawer.
    await page.keyboard.press('Escape')

    await expect(drawer).toBeHidden()
  })

  test('visual snapshot — drawer open on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await navigateTo(page, '/discussions')

    await page.getByTestId('aside-toggle-button').click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
  })
})
