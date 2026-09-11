import type { Page } from '@playwright/test'

/**
 * Wait for React hydration of below-fold streaming components.
 *
 * React 19 prioritises above-fold hydration; components scrolled out of
 * view receive lower-priority MessageChannel callbacks. requestIdleCallback
 * fires only after all pending macrotasks — including those callbacks — have
 * been flushed, so it is a reliable proxy for "this component is now
 * interactive even if it was below the fold when the page loaded."
 *
 * Use this when navigateTo() alone is insufficient because the element you
 * need to interact with lives inside a below-fold streaming boundary. Prefer
 * scrolling the element into view first (element.scrollIntoViewIfNeeded())
 * so React has a chance to bump its hydration priority before you call this.
 *
 * If you find yourself calling this frequently, consider fixing navigate-to.mts
 * to use a more deterministic hydration signal instead.
 */
export async function waitForBelowFoldHydration(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        const requestIdleCallbackMaybe = (
          window as typeof window & { requestIdleCallback?: typeof requestIdleCallback }
        ).requestIdleCallback
        if (requestIdleCallbackMaybe) {
          requestIdleCallbackMaybe(() => resolve(), { timeout: 500 })
          return
        }

        // When requestIdleCallback is unavailable, wait for two animation
        // frames so React has had paint cycles to hydrate below-fold
        // components. Race double-RAF against a short timeout so
        // throttled/hidden tabs cannot hang indefinitely; the timeout is a
        // completion bound, not the primary readiness signal.
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        let isResolved = false
        const resolveOnce = () => {
          if (isResolved) return
          isResolved = true
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
          }
          // `isResolved` makes the RAF/timeout race first-winner-only
          resolve()
        }

        requestAnimationFrame(() => requestAnimationFrame(resolveOnce))
        timeoutId = setTimeout(resolveOnce, 50)
      }),
  )
}
