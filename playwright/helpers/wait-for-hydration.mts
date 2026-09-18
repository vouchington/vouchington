import type { Page } from '@playwright/test'

// Playwright rejects an in-flight page.evaluate() with this message when a
// navigation replaces the document that evaluate was running in.
const DESTROYED_EXECUTION_CONTEXT_PATTERN = /Execution context was destroyed/i

// A redirect chain can replace the document more than once, so re-waiting is
// bounded: a redirect loop has to fail the test rather than hang it.
const MAX_DOCUMENT_REPLACEMENTS = 2

function isDestroyedExecutionContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return DESTROYED_EXECUTION_CONTEXT_PATTERN.test(message)
}

function evaluateHydrationSettled(page: Page): Promise<void> {
  return page.evaluate(
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

async function waitForHydrationSettled(
  page: Page,
  waitUntil: 'networkidle' | 'load',
  remainingReplacements: number,
): Promise<void> {
  try {
    await evaluateHydrationSettled(page)
  } catch (error) {
    if (!isDestroyedExecutionContextError(error) || remainingReplacements <= 0) throw error
    // A client-side redirect landed after the first document had already gone
    // quiet, destroying the context this evaluate was waiting in. Wait for the
    // document that replaced it, then measure hydration against that one.
    await page.waitForLoadState(waitUntil)
    await waitForHydrationSettled(page, waitUntil, remainingReplacements - 1)
  }
}

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
 * Tolerates a client-side redirect arriving mid-wait: the document the
 * readiness probe started in can be replaced before the probe resolves, which
 * destroys its execution context. Rather than failing, the wait restarts
 * against the document that replaced it, so hydration is always measured
 * against the document the caller ends up on. `waitUntil` is the load state to
 * settle that replacement document to; callers that navigated under a stricter
 * state should pass their own so a redirect does not silently weaken it.
 *
 * If you find yourself calling this frequently, consider fixing navigate-to.mts
 * to use a more deterministic hydration signal instead.
 */
export async function waitForBelowFoldHydration(
  page: Page,
  { waitUntil = 'load' as 'networkidle' | 'load' } = {},
): Promise<void> {
  await waitForHydrationSettled(page, waitUntil, MAX_DOCUMENT_REPLACEMENTS)
}
