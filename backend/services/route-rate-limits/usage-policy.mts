import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import type { RouteRateLimitCategory } from './types.mts'
import type { UsagePlan, UsageQuota, UsageScopeClass, UsageSurface } from './usage-types.mts'

// Provisional defaults for the request quota, kept as code constants. A request is one HTTP
// request; a JSON-RPC batch is still one request. The window is the sliding window the limiter
// counts over.
export const USAGE_QUOTA_WINDOW_SECONDS = 900

// Requests per window for a free-plan credential. Write-capable credentials get the smaller
// allowance because each of their calls can change state; the admin surface is staff-only and
// gets a larger one. `rest_user` is the allowance of one signed-in user across every REST route.
// `rest_anonymous` is one allowance for all anonymous REST traffic together, because an anonymous
// caller has no privacy-safe identity to divide it by. It is a reference level that is reported
// and never enforced, since a shared cap would let a few clients refuse everyone else.
const BASE_QUOTA_LIMITS: Record<UsageSurface, Record<UsageScopeClass, number>> = {
  mcp_user: { read: 900, write: 450 },
  mcp_admin: { read: 1800, write: 900 },
  rest_user: { read: 3600, write: 900 },
  rest_anonymous: { read: 36000, write: 9000 },
}

// A REST route is write-class when the route registry says it changes state, so the registry's
// deliberate classifications (such as the OAuth completion POST being a `read`) carry over.
const CATEGORY_SCOPE_CLASSES: Record<RouteRateLimitCategory, UsageScopeClass> = {
  read: 'read',
  write: 'write',
  sensitive: 'write',
  oauth_callback: 'write',
}

const PLAN_MULTIPLIERS: Record<UsagePlan, number> = { free: 1, plus: 2, pro: 4 }

export function selectUsageQuota(selection: {
  surface: UsageSurface
  plan: UsagePlan
  scopeClass: UsageScopeClass
}): UsageQuota {
  return {
    limit:
      BASE_QUOTA_LIMITS[selection.surface][selection.scopeClass] * PLAN_MULTIPLIERS[selection.plan],
    windowSeconds: USAGE_QUOTA_WINDOW_SECONDS,
  }
}

// A user with no paid membership is on the free plan.
export function resolveUsagePlan(owner: { membership_plan?: 'plus' | 'pro' | null }): UsagePlan {
  return owner.membership_plan ?? 'free'
}

// A credential is write-class when any scope it holds can change state, whatever resource it names.
export function resolveUsageScopeClass(scopes: readonly ApiScope[]): UsageScopeClass {
  return scopes.some(scope => SCOPE_DEFINITIONS[scope].action === 'write') ? 'write' : 'read'
}

// Session and sign-in routes are metered like any other but never refused for a spent quota: a
// user over quota must still be able to refresh the session, sign out and sign in again, and the
// attempt limiter already bounds these routes tightly.
const QUOTA_EXEMPT_ROUTE = /^[A-Z]+:\/api\/v1\/(?:session|auth)(?:\/|$)/

export function isUsageQuotaExemptRoute(routeKey: string): boolean {
  return QUOTA_EXEMPT_ROUTE.test(routeKey)
}

export function resolveRouteUsageScopeClass(category: RouteRateLimitCategory): UsageScopeClass {
  return CATEGORY_SCOPE_CLASSES[category]
}
