// Shared shape for the user-write MCP inventory exclusions. See
// backend/services/mcp-tools/user-write-inventory.test.mts for the rule these feed.
export const EXCLUSION_CATEGORIES = [
  'staff-only',
  'auth-session',
  'billing',
  'webhook-or-infra',
  'stateless-or-telemetry',
  'sensitive-account',
  'community-owner-ai',
  'copyright',
  'recorded-no-tool',
  'method-not-allowed',
] as const

export type ExclusionCategory = (typeof EXCLUSION_CATEGORIES)[number]

export type WriteExclusion = {
  method: string
  path: string
  category: ExclusionCategory
  reason: string
}

// Routes are `'METHOD /path'`, relative to `prefix` (the API version root by default).
export function exclusions(
  category: ExclusionCategory,
  reason: string,
  routes: readonly string[],
  prefix = '/api/v1',
): WriteExclusion[] {
  return routes.map(route => {
    const space = route.indexOf(' ')
    return {
      method: route.slice(0, space),
      path: prefix + route.slice(space + 1),
      category,
      reason,
    }
  })
}
