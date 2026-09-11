import { expect, type Locator, type Page } from '@playwright/test'

export const WIDE_VIEWPORT = { width: 1920, height: 1080 }

export async function ensureSidebarOpen(page: Page): Promise<Locator> {
  const sidebarPeer = page.getByTestId('sidebar-peer')
  if ((await sidebarPeer.getAttribute('data-state')) !== 'expanded') {
    await page.getByTestId('sidebar-trigger').click()
  }
  await expect(sidebarPeer).toHaveAttribute('data-state', 'expanded')
  return sidebarPeer
}

export async function collapseSidebar(page: Page) {
  const alreadyCollapsed = await page.evaluate(() => {
    const el = document.querySelector('[data-pw="sidebar-peer"]')
    return el !== null && parseFloat(window.getComputedStyle(el).width) < 1
  })
  if (alreadyCollapsed) return
  await page.keyboard.press('ControlOrMeta+/')
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-pw="sidebar-peer"]')
    return el !== null && parseFloat(window.getComputedStyle(el).width) < 1
  })
}

export async function collapseAside(page: Page) {
  const currentWidth = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    return aside ? parseFloat(window.getComputedStyle(aside).width) : null
  })
  // null = no aside on page; <= 1 = already collapsed — both are no-ops
  if (currentWidth === null || currentWidth <= 1) return
  await page.keyboard.press('ControlOrMeta+\\')
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const aside = document.querySelector('aside')
          return aside ? parseFloat(window.getComputedStyle(aside).width) : null
        }),
      { timeout: 5000, intervals: [50, 100] },
    )
    .toBeLessThanOrEqual(1)
}

export async function getNavbarBox(page: Page) {
  const navInner = page.locator('nav[aria-label="Main"] > div').first()
  const navBox = await navInner.boundingBox()
  expect(navBox).not.toBeNull()
  return navBox!
}
