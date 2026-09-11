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

test.describe('Sidebar transition', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('desktop: sidebar has CSS transition property', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    const transition = await sidebarPeer.evaluate(el =>
      getComputedStyle(el).getPropertyValue('transition'),
    )
    expect(transition).toContain('width')
  })

  test('desktop: sidebar is expanded with nonzero width', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')

    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { nonZero: true })
    const expandedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)

    // In-sidebar shortcut toggle is always clickable (not sr-only) and proves React has
    // hydrated since we can click a React-attached onClick handler.
    await page.getByTestId('app-sidebar-trigger').click()
    await expect(sidebarPeer).toHaveAttribute('data-state', 'collapsed')
    await waitForSidebarTransition(page, { changedFrom: expandedWidth })
    const collapsedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    expect(collapsedWidth).toBe(0)

    // Trigger is now visible (sidebar collapsed) — normal click works.
    await page.locator('[data-sidebar="trigger"]').click()
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { changedFrom: collapsedWidth, nonZero: true })

    const reopenedWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    expect(reopenedWidth).toBeGreaterThan(0)
  })

  test('desktop: sidebar and main content share horizontal layout', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')

    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { nonZero: true })
    const mainWithSidebar = await page
      .locator('main')
      .first()
      .evaluate(el => el.getBoundingClientRect().width)
    const expandedSidebarWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    expect(expandedSidebarWidth).toBeGreaterThan(0)
    expect(mainWithSidebar).toBeGreaterThan(0)

    // In-sidebar shortcut toggle is always clickable; dispatchEvent on the sr-only trigger
    // races React hydration locally.
    await page.getByTestId('app-sidebar-trigger').click()
    await expect(sidebarPeer).toHaveAttribute('data-state', 'collapsed')
    await waitForSidebarTransition(page, { changedFrom: expandedSidebarWidth })
    const collapsedSidebarWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    const mainWithoutSidebar = await page
      .locator('main')
      .first()
      .evaluate(el => el.getBoundingClientRect().width)
    expect(collapsedSidebarWidth).toBe(0)
    expect(mainWithoutSidebar).toBeGreaterThan(mainWithSidebar)
  })
})

test.describe('Sidebar viewport behavior', () => {
  test('desktop: trigger opens sidebar and content is pushed (no overlay)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/posts')

    const sidebar = page.locator('[data-sidebar="sidebar"]')
    const navbar = page.getByRole('navigation').filter({ hasText: 'Voucha' })

    await expect(navbar).toBeVisible()
    await expect(sidebar).toBeVisible()
    await expect(page.getByTestId('sidebar-peer')).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { nonZero: true })
    await expect(navbar).toBeVisible()
    await expect(page.getByTestId('sidebar-nav-discussions').first()).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    const navbarBox = await navbar.boundingBox()
    expect(sidebarBox).not.toBeNull()
    expect(navbarBox).not.toBeNull()
    expect(navbarBox?.x ?? 0).toBeGreaterThanOrEqual(
      (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0) - 2,
    )
  })

  test('desktop: navbar sidebar trigger remains available', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await navigateTo(page, '/')

    // Trigger is visibility:hidden when expanded — use data attribute to bypass a11y tree filtering
    const trigger = page.locator('[data-sidebar="trigger"]')
    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
    await waitForSidebarTransition(page, { nonZero: true })
    const expandedPeerWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)

    await trigger.dispatchEvent('click')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'collapsed')
    await waitForSidebarTransition(page, { changedFrom: expandedPeerWidth })
    const collapsedPeerWidth = await sidebarPeer.evaluate(el => el.getBoundingClientRect().width)
    expect(collapsedPeerWidth).toBe(0)
    await expect(page.getByRole('navigation').filter({ hasText: 'Voucha' })).toBeVisible()
  })

  test('tablet: sidebar pushes content like desktop (md breakpoint)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet)
    await navigateTo(page, '/posts')

    await ensureSidebarOpen(page)

    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toBeVisible()
    await expect(page.getByTestId('sidebar-nav-discussions').first()).toBeVisible()
    await expect(page.getByRole('navigation').filter({ hasText: 'Voucha' })).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    const navbarBox = await page.getByRole('navigation').filter({ hasText: 'Voucha' }).boundingBox()
    expect(sidebarBox).not.toBeNull()
    expect(navbarBox).not.toBeNull()
    expect(navbarBox?.x ?? 0).toBeGreaterThanOrEqual(
      (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0) - 2,
    )
  })

  test('mobile: sidebar trigger opens and closes sheet', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await navigateTo(page, '/')

    const trigger = page.getByTestId('sidebar-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('mobile: can navigate from sidebar sheet', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await navigateTo(page, '/posts')

    await page.getByTestId('sidebar-trigger').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('sidebar-nav-discussions').first().click()
    await expect(page).toHaveURL(/.*discussions/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discussions')
  })
})
