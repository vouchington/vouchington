/**
 * Tests that the main content column and footer are visually centred to the viewport
 * when the left sidebar is collapsed.
 *
 * The sidebar uses collapsible='offcanvas' — when collapsed it shrinks to 0 width, so
 * SidebarInset fills the full viewport. mx-auto max-w-[1200px] then centres naturally
 * without any extra padding needed.
 */
import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

const TOLERANCE_PX = 4

/** Wait for the sidebar's CSS transition to finish by polling computed width. */
async function waitForSidebarCollapsed(page: import('../../helpers/test.mts').Page) {
  await page.waitForFunction(() => {
    const sidebar = document.querySelector('[data-pw="sidebar-peer"]')
    return sidebar !== null && window.getComputedStyle(sidebar).width === '0px'
  })
}

test.describe('Sidebar collapsed content centering', () => {
  test('content column centres to viewport when sidebar collapses', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/')

    // Find the 1200px max-width content wrapper inside main
    const contentWrapper = page.getByTestId('page-content-wrapper')
    await expect(contentWrapper).toBeVisible()

    const beforeBox = await contentWrapper.boundingBox()
    expect(beforeBox).not.toBeNull()
    const beforeCentre = beforeBox!.x + beforeBox!.width / 2

    // Collapse the sidebar via keyboard shortcut (avoids pointer interception)
    await page.keyboard.press('ControlOrMeta+/')

    // Wait for the CSS transition to fully complete (not a fixed sleep — polls computed width)
    await waitForSidebarCollapsed(page)

    const afterBox = await contentWrapper.boundingBox()
    expect(afterBox).not.toBeNull()
    const afterCentre = afterBox!.x + afterBox!.width / 2

    // Use document.body.clientWidth as the centering reference.
    // document.documentElement.clientWidth includes the scrollbar-gutter: stable reserved
    // padding (~15px on Linux CI), returning the full viewport width (1280px) and causing
    // a 7.5px off-centre error. document.body.clientWidth correctly captures the layout
    // area that CSS uses for mx-auto centering (the body lives inside <html>'s content area,
    // which excludes the gutter).
    const layoutWidth = await page.evaluate(() => document.body.clientWidth)
    const layoutCentre = layoutWidth / 2

    // After collapse, content should be centred within the layout viewport
    expect(Math.abs(afterCentre - layoutCentre)).toBeLessThanOrEqual(TOLERANCE_PX)

    // Content should have shifted left relative to expanded state (centering correction)
    expect(afterCentre).toBeLessThan(beforeCentre + TOLERANCE_PX)
  })

  test('sidebar-site-footer is visible and contained within the sidebar', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await navigateTo(page, '/plans')

    const sidebarFooter = page.getByTestId('sidebar-site-footer')
    await expect(sidebarFooter).toBeVisible()

    // Footer is inside the sidebar (left side), not in the centred main content area
    const footerBox = await sidebarFooter.boundingBox()
    const layoutWidth = await page.evaluate(() => document.body.clientWidth)
    expect(footerBox).not.toBeNull()
    // Footer's right edge should be within the left half of the viewport (sidebar width ~256px)
    expect(footerBox!.x + footerBox!.width).toBeLessThan(layoutWidth / 2)
  })
})
