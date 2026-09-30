import {
  buildSearchToolSchemaProperties,
  expandHybridSearchArgs,
  type SearchSystemArgs,
} from './search-system.mts'

export type PagedSearchArgs = SearchSystemArgs & { q?: string; after?: string }

export type SearchPageInfo = {
  has_next_page: boolean
  start_cursor: string | null
  end_cursor: string | null
}

// What the REST routes return for an identifier that resolves to nothing.
export const EMPTY_PAGE_INFO: SearchPageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

/**
 * The schema properties of a paged search tool: the REST twin's `q`, `text_search_query`,
 * `semantic_search_query`, `after` and `limit`, plus the `search` shortcut and `similar_*` filters
 * the tool has always had. `limit` has no `maximum` on purpose: a schema maximum would reject an
 * oversized limit, and the REST parser clamps it instead.
 */
export function pagedSearchSchemaProperties(qDescription: string): Record<string, unknown> {
  return {
    q: { type: 'string', description: qDescription },
    ...buildSearchToolSchemaProperties({ includeLimit: false }),
    after: {
      type: 'string',
      description: 'Cursor from a previous result page_info.end_cursor, for the next page.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      description:
        'Maximum number of results per page. Defaults to 25; values over 100 are clamped to 100.',
    },
  }
}

/** The tool's search arguments spelled as the REST twin's query string, for its own parser. */
export function pagedSearchQuery(args: PagedSearchArgs): Record<string, unknown> {
  const { text_search_query, semantic_search_query } = expandHybridSearchArgs(args)
  const query: Record<string, unknown> = {
    q: args.q,
    text_search_query,
    semantic_search_query,
    similar_post: args.similar_post_id,
    similar_topic: args.similar_topic_id,
    similar_rss_feed_item: args.similar_rss_feed_item_id,
    after: args.after,
    limit: args.limit,
  }
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined))
}
