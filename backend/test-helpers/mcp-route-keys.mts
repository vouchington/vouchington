import type { ToolMeta } from '../services/openai-agents/tool-types.mts'
import { toRouteKey } from '../services/mcp-tools/tool-route-keys.mts'

/** Independent route projection used by MCP operation contract fixtures. */
export function toolRouteKeys(meta: ToolMeta | undefined, args: Record<string, unknown>): string[] {
  if (!meta?.api) return []
  const endpoints = meta.selectApi ? meta.selectApi(args) : meta.api
  return [...new Set(endpoints.map(toRouteKey))]
}
