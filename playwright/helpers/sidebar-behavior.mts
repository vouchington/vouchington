import type { Page } from '@playwright/test'

/**
 * Poll until the sidebar peer's width stops changing (CSS transition complete).
 * Pass nonZero: true when waiting for the sidebar to finish expanding.
 */
export async function waitForSidebarTransition(
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

export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
} as const
