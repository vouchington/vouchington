import { expect, test } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { TEST_USER_USERNAME } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { MOBILE_VIEWPORTS } from '../../helpers/viewport-constants.mts'
import { assertNoHorizontalScroll } from '../../helpers/mobile-assertions.mts'
import { requireTestValue } from '../../helpers/assertions.mts'

// Seeded card topic from playwright-test-data.mts
const CARD_TOPIC = {
  id: '019c64e6-f710-74cb-b36d-130af8ff1067',
  slug: 'card',
}

test.describe('Mobile responsiveness', () => {
  test.describe('P0 Landing page', () => {
    for (const [viewportName, viewport] of Object.entries(MOBILE_VIEWPORTS)) {
      test(`no horizontal scroll at ${viewportName} (${viewport.width}px)`, async ({ page }) => {
        await page.setViewportSize(viewport)
        const response = await page.goto(`/@${TEST_USER_USERNAME}`)
        expect(requireTestValue(response, 'Expected landing-page response').status()).toBe(200)

        const hasHorizontalScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        )
        expect(hasHorizontalScroll).toBe(false)
      })
    }

    test('touch targets meet 44px minimum at 375px', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
      const response = await page.goto(`/@${TEST_USER_USERNAME}`)
      expect(requireTestValue(response, 'Expected landing-page response').status()).toBe(200)

      // Check landing page CTA links only (profile links, referral cards, topic group entries).
      // Scoped to [data-item-id] to exclude inline markdown text links and icon utility buttons
      // which are not CTA cards and may intentionally be smaller than 44px.
      const ctaLinks = page.locator('a[data-item-id]:visible')
      await expect(
        ctaLinks,
        'Expected at least one visible CTA link on landing page',
      ).not.toHaveCount(0)
      const linkDimensions = await ctaLinks.evaluateAll(elements =>
        elements.map(el => {
          const { height, width } = el.getBoundingClientRect()
          return { height, width, text: el.textContent?.trim() || el.outerHTML.slice(0, 60) }
        }),
      )
      for (const [i, { height, width, text }] of linkDimensions.entries()) {
        expect(
          height,
          `Link "${text}" at index ${i} height should be >= 44px`,
        ).toBeGreaterThanOrEqual(44)
        expect(
          width,
          `Link "${text}" at index ${i} width should be >= 44px`,
        ).toBeGreaterThanOrEqual(44)
      }
    })

    test('slug variant renders correctly at 375px', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
      const response = await page.goto(`/@${TEST_USER_USERNAME}/bonus`)
      expect(requireTestValue(response, 'Expected landing-page response').status()).toBe(200)

      await expect(page.getByTestId('landing-page-title')).toContainText('Bonus page')

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(hasHorizontalScroll).toBe(false)
    })
  })

  test.describe('P1 Topic detail page', () => {
    for (const viewport of [
      { name: 'iphone-se', ...MOBILE_VIEWPORTS['iphone-se'] },
      { name: 'smallest', ...MOBILE_VIEWPORTS.smallest },
    ]) {
      test(`card topic at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await navigateTo(page, `/${CARD_TOPIC.slug}/${CARD_TOPIC.id}/discussions`)

        // h1 visible
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        // No horizontal scroll
        const hasHorizontalScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        )
        expect(hasHorizontalScroll).toBe(false)

        // Aside hidden on mobile (hidden below lg breakpoint)
        const aside = page.locator('aside')
        await expect(aside).toHaveCount(1)
        await expect(aside).toBeHidden()

        // Menubar navigation is visible and within viewport (seeded card topic always has items)
        const menubar = page.getByTestId('entity-menubar-nav')
        await expect(menubar, 'Expected topic menubar navigation to be rendered').toBeVisible()
        const menubarBox = requireTestValue(
          await menubar.boundingBox(),
          'Expected topic menubar bounding box',
        )
        expect(menubarBox.x).toBeGreaterThanOrEqual(0)
        expect(menubarBox.x + menubarBox.width).toBeLessThanOrEqual(viewport.width + 1)
      })
    }
  })

  test.describe('P2 Post form page', () => {
    test.use({ storageState: AUTH_STATE })

    test('no horizontal scroll at iphone-se on /data-points/create', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
      await navigateTo(page, '/data-points/create')

      await assertNoHorizontalScroll(page)
    })

    test('no horizontal scroll at smallest on /data-points/create', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.smallest)
      await navigateTo(page, '/data-points/create')

      await assertNoHorizontalScroll(page)
    })
  })

  test.describe('P3 News feed page', () => {
    test('no horizontal scroll at iphone-se on /discussions', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
      await navigateTo(page, '/discussions')

      await assertNoHorizontalScroll(page)
    })
  })

  test.describe('P4 Search palette', () => {
    test('dialog within viewport bounds at iphone-se', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
      await navigateTo(page, '/')

      // Open search palette via keyboard shortcut (cross-platform: Cmd on Mac, Ctrl on Linux/Windows)
      await page.keyboard.press('ControlOrMeta+k')

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const dialogBox = requireTestValue(
        await dialog.boundingBox(),
        'Expected search dialog bounding box',
      )
      expect(dialogBox.x, 'Dialog must not overflow left').toBeGreaterThanOrEqual(0)
      expect(dialogBox.x + dialogBox.width, 'Dialog must not overflow right').toBeLessThanOrEqual(
        MOBILE_VIEWPORTS['iphone-se'].width + 1,
      )
    })
  })

  test.describe('P5 Settings page', () => {
    test.use({ storageState: AUTH_STATE })

    test('no horizontal scroll at iphone-se on /my/preferences', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
      await navigateTo(page, '/my/preferences')

      await assertNoHorizontalScroll(page)
    })
  })

  test.describe('P6 Post list page', () => {
    test('no horizontal scroll at smallest on /discussions', async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORTS.smallest)
      await navigateTo(page, '/discussions')

      await assertNoHorizontalScroll(page)
    })
  })
})
