import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORTS,
  assertNoHorizontalScroll,
  navigateTo,
  requireTestValue,
} from 'vouchington-tooling/playwright'

const MOBILE = MOBILE_VIEWPORTS['iphone-se']

const KEY_PAGES: {
  toMobileTitle: string
  toDesktopTitle: string
  path: () => string
  requiresAuth: boolean
}[] = [
  {
    toMobileTitle: 'landing: no horizontal scroll after resize to mobile',
    toDesktopTitle: 'landing: no horizontal scroll after resize to desktop',
    path: () => `/@${TEST_USER_USERNAME}`,
    requiresAuth: false,
  },
  {
    toMobileTitle: 'discussions: no horizontal scroll after resize to mobile',
    toDesktopTitle: 'discussions: no horizontal scroll after resize to desktop',
    path: () => '/discussions',
    requiresAuth: false,
  },
  {
    toMobileTitle: 'post-form: no horizontal scroll after resize to mobile',
    toDesktopTitle: 'post-form: no horizontal scroll after resize to desktop',
    path: () => '/data-points/create',
    requiresAuth: true,
  },
]

test.describe('Viewport resize stability', () => {
  test.describe('desktop → mobile', () => {
    test.describe('public pages', () => {
      test('landing responds successfully before desktop-to-mobile resize', async ({ page }) => {
        await page.setViewportSize(DESKTOP_VIEWPORT)
        const response = await page.goto(`/@${TEST_USER_USERNAME}`)
        expect(requireTestValue(response, 'Expected landing page response').status()).toBe(200)
      })

      for (const { toMobileTitle, path, requiresAuth } of KEY_PAGES) {
        if (requiresAuth) continue

        test(toMobileTitle, async ({ page }) => {
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

      for (const { toMobileTitle, path, requiresAuth } of KEY_PAGES) {
        if (!requiresAuth) continue

        test(toMobileTitle, async ({ page }) => {
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

      for (const { toDesktopTitle, path, requiresAuth } of KEY_PAGES) {
        if (requiresAuth) continue

        test(toDesktopTitle, async ({ page }) => {
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

      for (const { toDesktopTitle, path, requiresAuth } of KEY_PAGES) {
        if (!requiresAuth) continue

        test(toDesktopTitle, async ({ page }) => {
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
