import { afterAll, afterEach, beforeAll } from 'vitest'

import { routeRateLimitConfig } from '../../services/route-rate-limits/config.mts'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '../dynamic-config.mts'

// Snapshots routeRateLimitConfig's live fields once per describe block, restores them after every
// individual case so one case's override never leaks into the next, and closes the scoped
// dynamic-config context after the whole block. Call this at the top of a describe block, before
// any case that overrides fields on routeRateLimitConfig via overrideDynamicConfigFieldsForTest.
export function useRouteRateLimitConfigSnapshot(): void {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
  }, 30_000)

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })
}
