/**
 * Tests that the sidebar collapses via a slide-left animation (clip) rather than a fade.
 * The inner sidebar content should remain fully opaque (opacity === '1') throughout the
 * collapse transition — the outer wrapper shrinks to 0 width under overflow-hidden,
 * clipping the content, producing a slide effect identical to AsideColumn.
 */
import { expect, test } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'

const VIEWPORT = { width: 1440, height: 900 }

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

    // Trigger collapse; immediately check opacity is still '1' (no fade)
    await page.keyboard.press('ControlOrMeta+/')

    // Poll: inner opacity stays '1' throughout the transition. Once outer is 0px wide, the
    // clipped content is invisible — but opacity itself must never drop below 1.
    await expect
      .poll(
        async () => {
          const opacity = await sidebarInner.evaluate(el => window.getComputedStyle(el).opacity)
          if (opacity !== '1') return `FAIL: opacity dropped to ${opacity}`
          const outerWidth = await sidebarPeer.evaluate(el =>
            parseFloat(window.getComputedStyle(el).width),
          )
          if (Number.isNaN(outerWidth)) return 'FAIL: outer not found'
          return outerWidth < 1 ? 'done' : 'waiting'
        },
        { timeout: 5000, intervals: [50, 100, 200] },
      )
      .toBe('done')
  })

  test('sidebar slides back open without opacity flash', async ({ page }) => {
    await page.setViewportSize(VIEWPORT)
    await navigateTo(page, '/')

    const sidebarPeer = page.getByTestId('sidebar-peer')
    await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')

    // Collapse first — same expect.poll pattern as the collapse test above
    await page.keyboard.press('ControlOrMeta+/')
    await expect
      .poll(
        async () => {
          const outerWidth = await sidebarPeer.evaluate(el =>
            parseFloat(window.getComputedStyle(el).width),
          )
          if (Number.isNaN(outerWidth)) return 'FAIL: outer not found'
          return outerWidth < 1 ? 'done' : 'waiting'
        },
        { timeout: 5000, intervals: [50, 100, 200] },
      )
      .toBe('done')

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
