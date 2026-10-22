import type { ToolApiEndpoint, ToolMeta } from '@services/openai-agents/tool-types'

// The rate-limit bucket key of a REST route, as its handler passes it to `requireAuth`. User tools
// write a path parameter as `:id` and admin tools as `{id}`; both name the same bucket.
export function toRouteKey(endpoint: ToolApiEndpoint): string {
  return `${endpoint.method}:${endpoint.path.replace(/\{(\w+)\}/g, ':$1')}`
}

// The REST route buckets a validated call exercises, each once: the endpoints `selectApi` narrows to
// when the tool has one, otherwise every route `meta.api` lists. A tool with no REST twin exercises
// none, so only the transport bucket applies to it.
export function toolRouteKeys(meta: ToolMeta | undefined, args: Record<string, unknown>): string[] {
  return [...new Set(toolRouteCharges(meta, args).flatMap(({ routeKeys }) => routeKeys))]
}

export type ToolRouteCharge = {
  routeKeys: readonly string[]
  weight: number
}

/**
 * Route charges preserve one combined unit for ordinary tools. A batch selector can attach a
 * weight to each selected route; each weighted route is then charged once per target before the
 * tool is allowed to run.
 */
export function toolRouteCharges(
  meta: ToolMeta | undefined,
  args: Record<string, unknown>,
): ToolRouteCharge[] {
  if (!meta?.api) return []
  const endpoints = meta.selectApi ? meta.selectApi(args) : meta.api
  const weighted = new Map<string, number>()
  const unweighted: string[] = []
  for (const endpoint of endpoints) {
    const routeKey = toRouteKey(endpoint)
    if (
      typeof endpoint.weight === 'number' &&
      Number.isSafeInteger(endpoint.weight) &&
      endpoint.weight > 0
    ) {
      weighted.set(routeKey, Math.max(weighted.get(routeKey) ?? 0, endpoint.weight))
    } else {
      unweighted.push(routeKey)
    }
  }
  const charges: ToolRouteCharge[] = []
  const unweightedKeys = [...new Set(unweighted)]
  if (unweightedKeys.length > 0) charges.push({ routeKeys: unweightedKeys, weight: 1 })
  for (const [routeKey, weight] of weighted) {
    charges.push({ routeKeys: [routeKey], weight })
  }
  return charges
}
