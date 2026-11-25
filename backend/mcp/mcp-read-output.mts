import { objectSchema } from '@vouchington/mcp-server/schema'
import type { SearchPageInfo } from './paged-search.mts'
import { pickProperties } from './read-tool-output-schema.mts'

/** The page sizes of a paged MCP read tool. `max` is the signed-out REST cap, not the service's. */
export type McpPageLimit = { readonly min: number; readonly max: number; readonly default: number }

export const iso = (value: Date | string): string => new Date(value).toISOString()

/** The `limit` and `after` inputs of a paged read tool, bounded like its REST twin. */
export function pageInputProperties(
  noun: string,
  { min, max, default: defaultLimit }: McpPageLimit,
) {
  return {
    limit: {
      type: 'integer',
      minimum: min,
      maximum: max,
      description: `${noun} per page; defaults to ${defaultLimit}.`,
    },
    after: {
      type: 'string',
    },
  }
}

export function pageInfoSchema() {
  return objectSchema(pickProperties('PageInfo', ['has_next_page', 'start_cursor', 'end_cursor']))
}

/** A successful page of a paged read tool: its results and the cursor for the next page. */
export type McpPage<TItem> = {
  success: true
  results: TItem[]
  page_info: SearchPageInfo
}

/** The properties of an `McpPage` whose results are `items`. */
export function pageProperties(items: Record<string, unknown>) {
  return { results: { type: 'array', items }, page_info: pageInfoSchema() }
}
