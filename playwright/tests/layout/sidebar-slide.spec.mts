/**
 * Tests that the sidebar collapses via a slide-left animation (clip) rather than a fade.
 * The inner sidebar content should remain fully opaque (opacity === '1') throughout the
 * collapse transition — the outer wrapper shrinks to 0 width under overflow-hidden,
 * clipping the content, producing a slide effect identical to AsideColumn.
 */
import { expect, test, type Locator } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const VIEWPORT = { width: 1440, height: 900 }

function waitForOpaqueSidebarCollapse(sidebarPeer: Locator) {
  return sidebarPeer.evaluate(peer => {
    const inner = peer.querySelector('[data-sidebar="sidebar"]')
    return new Promise<void>((resolve, reject) => {
      const sample = () => {
        const opacity = inner === null ? null : window.getComputedStyle(inner).opacity
        const outerWidth = parseFloat(window.getComputedStyle(peer).width)
        const reason =
          inner === null
            ? 'sidebar inner not found'
            : opacity !== '1'
              ? `opacity dropped to ${opacity}`
              : Number.isNaN(outerWidth)
                ? 'outer not found'
                : null
        if (reason !== null) {
          reject(new Error(reason))
          return
        }
        if (outerWidth < 1) {
          resolve()
          return
        }
        requestAnimationFrame(sample)
      }
      sample()
    })
  })
}

test.describe('Sidebar slide animation', () => {
  test('sidebar inner content stays opaque while collapsing', async ({ page }) => {
    await page.setViewportSize(VIEWPORT)
    await navigateTo(page, '/')

    // Confirm sidebar is expanded before collapsing
    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toBeVisible()

    // The inner content div is the direct content region inside the sidebar peer.
    const sidebarInner = sidebarPeer.locator('[data-sidebar="sidebar"]')

    // Opacity must be '1' before toggling
    const opacityBefore = await sidebarInner.evaluate(el => window.getComputedStyle(el).opacity)
    expect(opacityBefore).toBe('1')

    // Collapse samples opacity on animation frames until the outer width clips to 0.
    const collapsed = waitForOpaqueSidebarCollapse(sidebarPeer)
    await page.keyboard.press('ControlOrMeta+/')
    await collapsed
  })

  test('sidebar slides back open without opacity flash', async ({ page }) => {
    await page.setViewportSize(VIEWPORT)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    const collapsed = waitForOpaqueSidebarCollapse(sidebarPeer)
    await page.keyboard.press('ControlOrMeta+/')
    await collapsed

    // Re-open
    await page.keyboard.press('ControlOrMeta+/')

    // Wait for React state to reflect the expansion (data-state is set synchronously on toggle)
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    // Inner opacity must be '1' after expansion — no opacity class was applied during the slide
    const innerDiv = sidebarPeer.locator('[data-sidebar="sidebar"]')
    const opacity = await innerDiv.evaluate(el => window.getComputedStyle(el).opacity)
    expect(opacity).toBe('1')
  })
})
