import { test, expect, type Page } from '../../helpers/test.mts'

import { navigateTo } from '../../helpers/navigate-to.mts'
import { ensureSidebarOpen } from '../../helpers/layout-collapse.mts'

/**
 * Poll until the sidebar peer's width stops changing (CSS transition complete).
 * Pass nonZero: true when waiting for the sidebar to finish expanding.
 */
async function waitForSidebarTransition(
  page: Page,
  options: { changedFrom?: number; nonZero?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    ({ changedFrom, nonZero }) =>
      new Promise<void>(resolve => {
        const peer = document.querySelector('[data-pw="sidebar-peer"]')
        if (!peer) {
          resolve()
          return
        }
        let prevWidth = -1
        let stableFrames = 0
        let sawExpectedChange = changedFrom === undefined
        const check = () => {
          const width = peer.getBoundingClientRect().width
          if (!sawExpectedChange && width !== changedFrom) {
            sawExpectedChange = true
          }
          if (prevWidth !== -1 && width === prevWidth) {
            stableFrames += 1
          } else {
            stableFrames = 0
          }
          if (sawExpectedChange && stableFrames >= 2 && (!nonZero || width > 0)) {
            resolve()
          } else {
            prevWidth = width
            requestAnimationFrame(check)
          }
        }
        requestAnimationFrame(check)
      }),
    options,
  )
}

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
} as const

test.describe('Sidebar keyboard shortcut display', () => {
  test('shows sidebar button with keyboard shortcut badge', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    await ensureSidebarOpen(page)

    const shortcutToggle = page.getByTestId('app-sidebar-trigger')
    await expect(shortcutToggle).toBeVisible()

    const kbd = shortcutToggle.locator('kbd')
    await expect(kbd).toBeVisible()

    const kbdText = (await kbd.textContent()) ?? ''
    expect(kbdText.replace(/\s+/g, '')).toMatch(/^(⌘|Ctrl\+)\/$/)
    expect(kbdText).toContain('/')
  })

  test('keyboard shortcut toggles the sidebar', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { nonZero: true })
    const expandedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)

    await page.keyboard.press('Control+/')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'collapsed')
    await waitForSidebarTransition(page, { changedFrom: expandedWidth })
    const collapsedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    expect(collapsedWidth).toBe(0)

    await page.keyboard.press('Control+/')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { changedFrom: collapsedWidth, nonZero: true })
  })

  test('shortcut button collapses the sidebar', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { nonZero: true })
    const expandedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)

    await page.getByTestId('app-sidebar-trigger').click()
    await expect(sidebarPeer).toHaveAttribute('data-state', 'collapsed')
    await waitForSidebarTransition(page, { changedFrom: expandedWidth })
    const collapsedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    expect(collapsedWidth).toBe(0)
  })
})

test.describe('Sidebar sticky behavior', () => {
  test('desktop: sidebar stays in viewport after scrolling long content', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/discussions')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    await page.addStyleTag({ content: 'main { min-height: 180vh !important; }' })

    // Scroll the page down by a large amount and verify the page actually scrolled
    await page.evaluate(() => window.scrollBy(0, 1000))
    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBeGreaterThan(0)

    // The sidebar inner div should still be pinned to the top of the viewport
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toBeVisible()

    const box = await sidebar.boundingBox()
    expect(box).not.toBeNull()
    // boundingBox() returns Blink LayoutUnit values quantized to 1/64px, so a
    // sticky element pinned at top: 0 can measure fractionally negative
    // (observed: -0.21875 = -14/64) depending on the CI font stack's computed
    // line-height. -1 still catches a real "scrolled away" regression, which
    // moves the sidebar by tens to hundreds of px.
    expect(box?.y ?? Infinity).toBeGreaterThan(-1)
    expect(box?.y ?? Infinity).toBeLessThan(10)
  })
})

test.describe('Sidebar animation', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('sidebar inner content uses width-only transition (no opacity fade)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    const innerDiv = sidebarPeer.locator('div').first()
    const transition = await innerDiv.evaluate(el =>
      getComputedStyle(el).getPropertyValue('transition'),
    )
    expect(transition).toContain('width')
    expect(transition).not.toContain('opacity')
  })

  test('sidebar inner content starts opaque (no fade)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    const innerDiv = sidebarPeer.locator('div').first()
    const expandedOpacity = await innerDiv.evaluate(el => getComputedStyle(el).opacity)
    expect(Number(expandedOpacity)).toBe(1)

    const opacity = await innerDiv.evaluate(el => getComputedStyle(el).opacity)
    expect(Number(opacity)).toBe(1)
  })

  test('reduced motion: sidebar transitions are effectively instant', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    const innerDiv = sidebarPeer.locator('div').first()
    const transitionDuration = await innerDiv.evaluate(el =>
      getComputedStyle(el).getPropertyValue('transition-duration'),
    )
    const durations = transitionDuration.split(',').map(d => Number.parseFloat(d.trim()))
    for (const d of durations) {
      expect(d).toBeLessThanOrEqual(0.002)
    }
  })
})
