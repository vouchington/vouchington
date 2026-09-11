import { getRouteConfig } from './config.mts'
import { buildRateLimitKeys } from './identity.mts'
import { routeRateLimiters } from './check.mts'
import type { RateLimitIdentities } from './types.mts'

export function createRouteRateLimitKeyCleanup(
  deleteKeys: typeof deleteRouteRateLimitKeys = deleteRouteRateLimitKeys,
) {
  const ownedScopes: Array<{
    routeKey: string
    identities: Readonly<RateLimitIdentities>
  }> = []

  return {
    async resetAndOwn(routeKey: string, identities: RateLimitIdentities): Promise<void> {
      const ownedIdentities = { ...identities }
      ownedScopes.push({ routeKey, identities: ownedIdentities })
      await deleteKeys(routeKey, ownedIdentities)
    },
    async cleanup(): Promise<void> {
      const scopes = ownedScopes.splice(0)
      const results = await Promise.allSettled(
        scopes.map(({ routeKey, identities }) => deleteKeys(routeKey, identities)),
      )
      const errors: unknown[] = []
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') continue
        ownedScopes.push(scopes[index])
        errors.push(result.reason)
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Failed to clean up owned route rate-limit keys')
      }
    },
  }
}

/**
 * Delete only the Valkey rate-limit keys a test itself wrote, instead of
 * RateLimiter#invalidate()'s prefix-wide SCAN+UNLINK, which wipes every
 * concurrently-running fork's counters for the category (read/write/sensitive),
 * not just the caller's. Reuses the exact buildRateLimitKeys()/getRouteConfig()
 * production uses, so it can never drift from how checkRouteRateLimit() derives
 * keys, then deletes exactly those keys via the limiter's targeted delete(...ids).
 *
 * Kept service-local rather than in @voucha/test-helpers: @services/route-rate-limits
 * already depends on @voucha/test-helpers as a devDependency (for createTestUser() etc
 * in check.test.mts), so a reverse dependency from test-helpers back to this service would
 * close a workspace cycle. See backend/services/entity-relations/test-support.mts for the
 * same pattern applied to a different service.
 *
 * Use for fixed-identity unit tests that construct RateLimitIdentities directly (e.g.
 * backend/services/route-rate-limits/check.test.mts). HTTP-layer tests that mint a fresh
 * createRequest() per call already get a unique IP and never need any cleanup at all.
 */
export async function deleteRouteRateLimitKeys(
  routeKey: string,
  identities: RateLimitIdentities,
): Promise<void> {
  const { category } = getRouteConfig(routeKey)
  const ids = buildRateLimitKeys(routeKey, identities)
  if (ids.length === 0) return
  await routeRateLimiters[category].delete(...ids)
}
