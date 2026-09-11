import { expect, type Locator, type Page } from './test.mts'

interface ImageResponseGuard {
  assertNoImageFailures(): void
}

/**
 * Registers response and requestfailed listeners on `page` to record any image
 * requests that fail at the network level or return a non-2xx HTTP status.
 *
 * Call once at the top of a test, then call `assertNoImageFailures()` after the
 * interaction under test completes. This is the network-level gate — it catches
 * off-screen and lazy-loaded images that `expectAllImagesLoaded` cannot see.
 *
 * Intentionally broad: any image failure during the test will surface here.
 * If a specific known-flaky external host is expected to fail, add it to
 * `BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST` in blocked-external-network.mts
 * instead of suppressing the error here.
 */
export function installImageResponseGuard(page: Page): ImageResponseGuard {
  const failures: Array<{ url: string; status: number | null }> = []

  // Treat 2xx (success) and 3xx (304 Not Modified, redirect hops) as healthy — Playwright
  // emits a response event for each hop, and the terminal response is what matters.
  page.on('response', response => {
    const status = response.status()
    if (status >= 200 && status < 400) return
    if (response.request().resourceType() === 'image') {
      failures.push({ url: response.url(), status })
    }
  })

  page.on('requestfailed', request => {
    if (request.resourceType() === 'image') {
      failures.push({ url: request.url(), status: null })
    }
  })

  return {
    assertNoImageFailures() {
      if (failures.length === 0) return
      const details = failures.map(f => `  ${f.status ?? 'failed'} ${f.url}`).join('\n')
      throw new Error(`${failures.length} image(s) failed to load:\n${details}`)
    },
  }
}

/**
 * Polls until every `<img>` element under `scope` has finished loading with
 * a non-zero naturalWidth and naturalHeight, indicating the image bytes were
 * successfully decoded by the browser.
 *
 * This is the DOM-level gate — it catches "src set but failed to decode" cases
 * even when the request returned 200 with an invalid body. Fails if `scope`
 * contains zero matching `<img>` elements so callers can't pass on an empty
 * tree (e.g. if a regression strips all images from the rendered modal).
 *
 * Skips images that have no `src` attribute (placeholder elements) and images
 * inside `[class*="line-clamp"]` containers that are hidden by CSS truncation.
 */
export async function expectAllImagesLoaded(scope: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        scope.evaluate(el => {
          const imgs = [
            ...(el as HTMLElement).querySelectorAll<HTMLImageElement>('img[src]'),
          ].filter(img => !img.closest('[class*="line-clamp"]'))
          if (imgs.length === 0) return false
          return imgs.every(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
        }),
      {
        message: 'scope should contain at least one img that loads with non-zero dimensions',
      },
    )
    .toBe(true)
}
