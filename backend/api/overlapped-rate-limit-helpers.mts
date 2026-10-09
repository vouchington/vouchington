import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'

export interface UserWithRateLimit {
  currentUser: PrivateUser | null
  // Applies the already-charged limiter result (429 and headers) and then meters usage. Call it
  // exactly once, at the point the route's precedence needs the limiter outcome.
  settleRateLimit: () => Promise<void>
}

// Charges the route limiter while the user is fetched. The limiter reads only memoized session
// token data, so the two overlap and the request saves one serial round trip. Headers, 429s and
// usage metering are deferred to settleRateLimit so status precedence is unchanged. A single
// limiter charge serves both the anonymous and the authenticated outcome.
export async function getCurrentUserWithRateLimit(
  ctx: Context,
  routeId: string,
): Promise<UserWithRateLimit> {
  // Captured so a user-fetch failure cannot leave an unhandled limiter rejection.
  const prepared = ctx.prepareRouteRateLimit(routeId).then(
    check => ({ check }) as const,
    (err: unknown) => ({ err }) as const,
  )
  const currentUser = await ctx.getCurrentUser()
  return {
    currentUser,
    settleRateLimit: async () => {
      const outcome = await prepared
      if ('err' in outcome) throw outcome.err
      await ctx.settleRouteRateLimit(routeId, outcome.check)
    },
  }
}
