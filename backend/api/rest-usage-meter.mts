import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import {
  checkUsageQuota,
  getRouteConfig,
  isUsageQuotaExemptRoute,
  resolveRouteUsageScopeClass,
  resolveUsagePlan,
  selectUsageQuota,
  type UsagePlan,
} from '@services/route-rate-limits'
import { getPrivateUserByAny } from '@services/users/get'
import { settleUsageOnClose } from './usage-meter-helpers.mts'

// A route may call applyRouteRateLimit more than once; the request is metered and checked once.
const meteredRequests = new WeakSet<Context>()

// Meters one REST request against the outcome-based usage quota, after the attempt-based limit
// has already passed (so a request that limit refused is never a usage event). A signed-in caller
// draws on their own allowance, which is checked here and refused with the same 429 and
// `Retry-After` an MCP caller gets; session and sign-in routes are metered but never refused. An
// anonymous caller (`userId` null) is metered as one aggregate and never refused: nothing
// privacy-safe tells anonymous callers apart, and a shared cap would let a few clients lock
// everyone else out. Either way the quota is charged and the usage event emitted when the
// response closes, so a 5xx is never charged.
export async function meterRestUsage(
  ctx: Context,
  routeKey: string,
  userId: string | null,
): Promise<void> {
  if (meteredRequests.has(ctx)) return
  meteredRequests.add(ctx)

  const startedAt = performance.now()
  const scopeClass = resolveRouteUsageScopeClass(getRouteConfig(routeKey).category)

  if (userId === null) {
    const surface = 'rest_anonymous'
    const quota = selectUsageQuota({ surface, plan: 'free', scopeClass })
    settleUsageOnClose(
      ctx,
      { surface, identity: { credential: 'anonymous' }, plan: 'free', scopeClass, quota },
      startedAt,
    )
    return
  }

  const surface = 'rest_user'
  const plan = await resolveSessionPlan(userId, ctx.currentUser)
  const quota = selectUsageQuota({ surface, plan, scopeClass })
  settleUsageOnClose(
    ctx,
    { surface, identity: { credential: 'session', userId }, plan, scopeClass, quota },
    startedAt,
  )

  if (isUsageQuotaExemptRoute(routeKey)) return
  const check = await checkUsageQuota(surface, userId, quota)
  if (!check.limited) return
  // The attempt limiter's counters describe a different limit; the usage 429 carries only the
  // authoritative Retry-After, exactly as an MCP 429 does.
  ctx.res.removeHeader('X-RateLimit-Limit')
  ctx.res.removeHeader('X-RateLimit-Remaining')
  ctx.set('Retry-After', String(check.retryAfterSeconds))
  ctx.throw(429, 'Usage quota exceeded')
}

type PlanOwner = Parameters<typeof resolveUsagePlan>[0]

interface UsagePlanDependencies {
  loadOwner: (userId: string) => Promise<PlanOwner | null>
  reportError: (error: Error) => void
}

const defaultPlanDependencies: UsagePlanDependencies = {
  loadOwner: getPrivateUserByAny,
  reportError: onError,
}

// Reuses the user the route already loaded; otherwise reads by id. It deliberately avoids
// getCurrentUser, which can rewrite session cookies, because applyRouteRateLimit also runs on the
// auth routes that carry their own tokens. A failed read costs a plan tier, not the request.
export async function resolveSessionPlan(
  userId: string,
  loaded: (PlanOwner & { id: string }) | null | undefined,
  { loadOwner, reportError }: UsagePlanDependencies = defaultPlanDependencies,
): Promise<UsagePlan> {
  try {
    const owner = loaded?.id === userId ? loaded : await loadOwner(userId)
    return resolveUsagePlan(owner ?? {})
  } catch (err) {
    reportError(err instanceof Error ? err : new Error(String(err)))
    return 'free'
  }
}
