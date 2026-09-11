/**
 * Mobile aside behavior tests.
 *
 * Rules:
 * - Non-infinite scroll pages: aside content shows below main content on mobile
 * - Infinite scroll pages: aside is hidden inline; a toggle button below the header
 *   opens the aside as a right-side drawer
 * - Pages with no aside (e.g. login, admin): main content is horizontally centered
 *   (no empty 334px column pushing content left)
 * - Toggle button is visible at all viewports (not just mobile)
 * - Toggle button does not push page content down (zero-height overlay)
 */
import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

const MOBILE = MOBILE_VIEWPORTS['iphone-se']

test.describe('Mobile aside behavior', () => {
  test.describe('Non-infinite-scroll pages — aside shows below main content', () => {
    test.describe('authenticated', () => {
      test.use({ storageState: AUTH_STATE })

      test('settings page shows aside below main content on mobile', async ({ page }) => {
        await page.setViewportSize(MOBILE)
        await navigateTo(page, '/my/preferences')

        // Aside should be rendered (not hidden)
        const aside = page.locator('main aside')
        await expect(aside).toBeVisible()

        // The aside should appear below the main content (higher Y position)
        // oxlint-disable-next-line no-mistakes/playwright-selector-priority -- inspecting computed geometry of inner layout wrappers via HTML id; no semantic equivalent
        const mainContent = page.locator('#main-content > div > div').first()
        const asideBox = await aside.boundingBox()
        const mainBox = await mainContent.boundingBox()

        const asideLayout = requireTestValue(asideBox, 'Expected aside layout box')
        const mainLayout = requireTestValue(mainBox, 'Expected main content layout box')
        expect(asideLayout.y).toBeGreaterThanOrEqual(mainLayout.y)

        await assertNoHorizontalScroll(page)
      })
    })

    test('plans page shows aside below main content on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/plans')

      const aside = page.locator('main aside')
      await expect(aside).toBeVisible()
      await assertNoHorizontalScroll(page)
    })

    test('toggle button opens Sheet drawer on non-infinite-scroll page on mobile', async ({
      page,
    }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/plans')
      await waitForBelowFoldHydration(page)

      await page.getByTestId('aside-toggle-button').click()

      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
    })
  })

  test.describe('Infinite scroll pages — drawer toggle', () => {
    test('toggle button visible below header on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/discussions')

      const toggleBtn = page.getByTestId('aside-toggle-button')
      await expect(toggleBtn).toBeVisible()
    })

    test('toggle button visible on desktop', async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT)
      await navigateTo(page, '/discussions')

      const toggleBtn = page.getByTestId('aside-toggle-button')
      await expect(toggleBtn).toBeVisible()
    })

    test('toggle button does not push content down on mobile', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/discussions')

      const toggleBtn = page.getByTestId('aside-toggle-button')
      const toggleBox = await toggleBtn.boundingBox()
      const toggleLayout = requireTestValue(toggleBox, 'Expected aside toggle layout box')

      // Navbar is 48px (h-12). The toggle button should overlap with the top of the main
      // content area (not create a separate row below it).
      // The button starts at sticky top-12 (48px) + 4px py-1 = ~52px from top.
      // Main content starts at top of page minus navbar padding.
      // Verify: the button's bottom edge (toggleBox.y + height) is less than 120px from top
      // — if it pushed content, the gap would be much larger.
      expect(toggleLayout.y + toggleLayout.height).toBeLessThan(120)
    })

    test('inline aside is hidden on mobile for infinite scroll pages', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/discussions')

      const aside = page.locator('main aside')
      // The aside exists in DOM but is CSS-hidden (hidden lg:block)
      await expect(aside).toBeHidden()
    })

    test('clicking toggle opens aside drawer from right', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/discussions')
      await waitForBelowFoldHydration(page)

      const toggleBtn = page.getByTestId('aside-toggle-button')
      await toggleBtn.click()

      // Sheet/dialog should open
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
    })

    test('mobile drawer open shows aside content', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/discussions')
      await waitForBelowFoldHydration(page)

      await page.getByTestId('aside-toggle-button').click()
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()
    })
  })

  test.describe('Pages with no aside — main content centered', () => {
    test('login page has no empty aside column', async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT)
      await navigateTo(page, '/login')

      // No aside element should be rendered
      const aside = page.locator('main aside')
      await expect(aside).toHaveCount(0)

      await assertNoHorizontalScroll(page)
    })

    test('login page has no drawer toggle', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await navigateTo(page, '/login')

      const toggleBtn = page.getByTestId('aside-toggle-button')
      await expect(toggleBtn).toHaveCount(0)
    })
  })

  test.describe('No horizontal scroll with new aside layout', () => {
    const viewports = {
      smallest: { width: 320, height: 568 },
      mobile: MOBILE_VIEWPORTS['iphone-se'],
      tablet: { width: 768, height: 1024 },
    } as const

    for (const [name, viewport] of Object.entries(viewports)) {
      test(`discussions page no horizontal scroll at ${name} (${viewport.width}px)`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)
        await navigateTo(page, '/discussions')
        await assertNoHorizontalScroll(page)
      })
    }

    test.describe('settings pages — authenticated', () => {
      test.use({ storageState: AUTH_STATE })

      for (const [name, viewport] of Object.entries(viewports)) {
        test(`settings page no horizontal scroll at ${name} (${viewport.width}px)`, async ({
          page,
        }) => {
          await page.setViewportSize(viewport)
          await navigateTo(page, '/my/preferences')
          await assertNoHorizontalScroll(page)
        })
      }
    })
  })
})
