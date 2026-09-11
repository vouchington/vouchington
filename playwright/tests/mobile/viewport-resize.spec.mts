import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'
import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

const MOBILE = MOBILE_VIEWPORTS['iphone-se']

const KEY_PAGES: { name: string; path: () => string; requiresAuth: boolean }[] = [
  { name: 'landing', path: () => `/@${TEST_USER_USERNAME}`, requiresAuth: false },
  { name: 'discussions', path: () => '/discussions', requiresAuth: false },
  { name: 'post-form', path: () => '/data-points/create', requiresAuth: true },
]

test.describe('Viewport resize stability', () => {
  test.describe('desktop → mobile', () => {
    test.describe('public pages', () => {
      test('landing responds successfully before desktop-to-mobile resize', async ({ page }) => {
        await page.setViewportSize(DESKTOP_VIEWPORT)
        const response = await page.goto(`/@${TEST_USER_USERNAME}`)
        expect(requireTestValue(response, 'Expected landing page response').status()).toBe(200)
      })

      for (const { name, path, requiresAuth } of KEY_PAGES) {
        if (requiresAuth) continue

        test(`${name}: no horizontal scroll after resize to mobile`, async ({ page }) => {
          await page.setViewportSize(DESKTOP_VIEWPORT)

          await navigateTo(page, path())

          await page.setViewportSize(MOBILE)
          await assertNoHorizontalScroll(page)

          await page.setViewportSize(DESKTOP_VIEWPORT)
          await assertNoHorizontalScroll(page)
        })
      }
    })

    test.describe('authenticated pages', () => {
      test.use({ storageState: AUTH_STATE })

      for (const { name, path, requiresAuth } of KEY_PAGES) {
        if (!requiresAuth) continue

        test(`${name}: no horizontal scroll after resize to mobile`, async ({ page }) => {
          await page.setViewportSize(DESKTOP_VIEWPORT)

          await navigateTo(page, path())

          await page.setViewportSize(MOBILE)
          await assertNoHorizontalScroll(page)

          await page.setViewportSize(DESKTOP_VIEWPORT)
          await assertNoHorizontalScroll(page)
        })
      }
    })
  })

  test.describe('mobile → desktop', () => {
    test.describe('public pages', () => {
      test('landing responds successfully before mobile-to-desktop resize', async ({ page }) => {
        await page.setViewportSize(MOBILE)
        const response = await page.goto(`/@${TEST_USER_USERNAME}`)
        expect(requireTestValue(response, 'Expected landing page response').status()).toBe(200)
      })

      for (const { name, path, requiresAuth } of KEY_PAGES) {
        if (requiresAuth) continue

        test(`${name}: no horizontal scroll after resize to desktop`, async ({ page }) => {
          await page.setViewportSize(MOBILE)

          await navigateTo(page, path())

          await page.setViewportSize(DESKTOP_VIEWPORT)
          await assertNoHorizontalScroll(page)

          await page.setViewportSize(MOBILE)
          await assertNoHorizontalScroll(page)
        })
      }
    })

    test.describe('authenticated pages', () => {
      test.use({ storageState: AUTH_STATE })

      for (const { name, path, requiresAuth } of KEY_PAGES) {
        if (!requiresAuth) continue

        test(`${name}: no horizontal scroll after resize to desktop`, async ({ page }) => {
          await page.setViewportSize(MOBILE)

          await navigateTo(page, path())

          await page.setViewportSize(DESKTOP_VIEWPORT)
          await assertNoHorizontalScroll(page)

          await page.setViewportSize(MOBILE)
          await assertNoHorizontalScroll(page)
        })
      }
    })
  })
})
