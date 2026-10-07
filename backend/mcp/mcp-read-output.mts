import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import type { SearchPageInfo } from './paged-search.mts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'

/** The page sizes of a paged MCP read tool. `max` is the signed-out REST cap, not the service's. */
export type McpPageLimit = { readonly min: number; readonly max: number; readonly default: number }

/**
 * The trending tools page like the signed-out REST routes: 25 at most where the authenticated
 * routes allow 50, with the REST default of 10.
 */
export const TRENDING_PAGE_LIMIT: McpPageLimit = { min: 1, max: 25, default: 10 }

/**
 * Free text from another user, as an MCP client receives it: sanitized, then fenced as external.
 * Missing or empty text is `null`, so a client never reads an empty fence as content.
 */
export async function externalText(
  text: string | null,
  source: string,
  contentType: string,
): Promise<string | null> {
  if (text === null || text.trim() === '') return null
  return wrapExternalContent(await sanitizePromptInjection(text), { source, contentType })
}

/** A name, title or username: sanitized as a title, never fenced. */
export function sanitizedTitle(text: string): Promise<string> {
  return sanitizePromptInjection(text, { isTitle: true })
}

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
      description: `${noun} per page, from ${min} to ${max} (default: ${defaultLimit})`,
    },
    after: {
      type: 'string',
      description: 'Opaque cursor from the previous page_info.end_cursor, for the next page.',
    },
  }
}

export function pageInfoSchema() {
  return closedObject(pickProperties('PageInfo', ['has_next_page', 'start_cursor', 'end_cursor']))
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
