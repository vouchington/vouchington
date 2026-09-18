import type { Page } from '@playwright/test'
import { retryOnConnectionLost } from './retry-on-connection-lost.mts'
import { installTurnstileStub } from './turnstile-stub.mts'
import { waitForBelowFoldHydration } from './wait-for-hydration.mts'

/**
 * Navigate to a URL and wait for network idle (or a custom wait state).
 * Always use this instead of raw page.goto() to avoid flaky tests
 * caused by interacting with pages before they've fully loaded.
 *
 * Installs the Turnstile stub once per page (see turnstile-stub.mts) so the
 * /login widget does not keep challenges.cloudflare.com traffic alive past
 * the 15s navigation timeout.
 *
 * Retries transient worker connection errors (ERR_CONNECTION_REFUSED / RESET) using
 * bounded retries and 5s backoff to absorb wrangler/workerd cold-starts in shards.
 *
 * Pass `waitUntil: 'load'` for pages with persistent SSE streams (admin dashboards)
 * that never reach networkidle because their event-source connection stays open.
 *
 * Safe for URLs that redirect on the client — the readiness wait restarts against
 * whichever document the redirect lands on (see wait-for-hydration.mts).
 */
export async function navigateTo(
  page: Page,
  url: string,
  { waitUntil = 'networkidle' as 'networkidle' | 'load' } = {},
  dependencies?: Partial<{
    installTurnstileStub: typeof installTurnstileStub
    retryOnConnectionLost: typeof retryOnConnectionLost
  }>,
) {
  const installStub = dependencies?.installTurnstileStub ?? installTurnstileStub
  const retry = dependencies?.retryOnConnectionLost ?? retryOnConnectionLost
  await installStub(page)
  await retry(async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState(waitUntil)
    // React 19 + React Compiler can attach above-fold click handlers slightly after
    // networkidle on slower machines. Wait for one idle callback so onClick handlers
    // are wired up before tests try to interact.
    //
    // A route that redirects on the client can reach `waitUntil` before the
    // redirect fires, so pass it through: if the redirect lands mid-wait, the
    // replacement document is settled to the same state this call asked for.
    await waitForBelowFoldHydration(page, { waitUntil })
  })
}
