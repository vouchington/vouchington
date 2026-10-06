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
  if (!meta?.api) return []
  const endpoints = meta.selectApi ? meta.selectApi(args) : meta.api
  return [...new Set(endpoints.map(toRouteKey))]
}
