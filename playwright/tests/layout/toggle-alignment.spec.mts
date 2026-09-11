/**
 * Tests that the sidebar toggle button (in the navbar) and the right-aside toggle button
 * are horizontally aligned with the edges of the 1200px max-width content column on wide
 * viewports. Prevents toggles from floating far away from the content they control.
 */
import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

// Wide enough that the 1200px max-width column is active and gaps become visible
const WIDE_VIEWPORT = { width: 1920, height: 1080 }
const TOLERANCE_PX = 16 // allow small pixel-rounding differences

test.describe('Toggle button alignment on wide desktop', () => {
  test('left sidebar trigger aligns with content column left edge', async ({ page }) => {
    await page.setViewportSize(WIDE_VIEWPORT)
    await navigateTo(page, '/')

    // The navbar inner container (mx-auto max-w-[1200px]) holds the sidebar trigger
    const navInner = page.locator('nav[aria-label="Main"] > div').first()
    const navBox = await navInner.boundingBox()
    expect(navBox).not.toBeNull()

    // The content column inside main
    const contentWrapper = page.getByTestId('page-content-wrapper')
    const contentBox = await contentWrapper.boundingBox()
    expect(contentBox).not.toBeNull()

    // Nav inner and content column should have matching left edges
    expect(Math.abs(navBox!.x - contentBox!.x)).toBeLessThanOrEqual(TOLERANCE_PX)
  })

  test('Voucha logo aligns with content column left edge when sidebar is open', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE_VIEWPORT)
    await navigateTo(page, '/')

    // Confirm sidebar is expanded (default)
    const sidebarPeer = page.getByTestId('sidebar-peer')
    const sidebarWidth = await sidebarPeer.evaluate(el =>
      parseFloat(window.getComputedStyle(el).width),
    )
    expect(sidebarWidth).toBeGreaterThan(200)

    // The Voucha logo link is the leftmost visible item in the navbar when sidebar is open
    // (SidebarTrigger is sr-only via `md:group-data-[state=expanded]/sidebar-wrapper:sr-only`)
    const logo = page.getByTestId('navbar-logo')
    const logoBox = await logo.boundingBox()
    expect(logoBox).not.toBeNull()

    // The page content wrapper has the same left edge as the navbar inner container
    const contentWrapper = page.getByTestId('page-content-wrapper')
    const contentBox = await contentWrapper.boundingBox()
    expect(contentBox).not.toBeNull()

    // Logo left edge should be within 4px of the content column left edge
    expect(Math.abs(logoBox!.x - contentBox!.x)).toBeLessThanOrEqual(4)
  })

  test('right aside toggle aligns at content column right boundary when aside is open', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE_VIEWPORT)
    await navigateTo(page, '/')

    // Aside column is 334px inside the content wrapper. Toggle button with lg:mr-[334px]
    // should sit at the boundary between the content column and the aside.
    const toggleButton = page.getByTestId('aside-toggle-button')
    const toggleBox = await toggleButton.boundingBox()
    expect(toggleBox).not.toBeNull()

    const contentWrapper = page.getByTestId('page-content-wrapper')
    const contentBox = await contentWrapper.boundingBox()
    expect(contentBox).not.toBeNull()

    const contentRight = contentBox!.x + contentBox!.width
    // Toggle should be near the right edge of the content column minus aside width
    const expectedX = contentRight - 334
    expect(Math.abs(toggleBox!.x + toggleBox!.width - expectedX)).toBeLessThanOrEqual(TOLERANCE_PX)
  })
})
