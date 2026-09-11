export type SearchSystemArgs = {
  search?: string
  text_search_query?: string
  semantic_search_query?: string
  limit?: number
  similar_post_id?: string
  similar_topic_id?: string
  similar_rss_feed_item_id?: string
}

type NormalizeSearchToolArgsOptions = {
  defaultLimit: number
  maxLimit: number
}

export function clampToolLimit(
  value: number | undefined,
  defaultLimit: number,
  maxLimit: number,
): number {
  return Math.min(Math.max(1, Math.floor(value ?? defaultLimit)), maxLimit)
}

export function normalizeSearchToolArgs<T extends SearchSystemArgs>(
  args: T,
  options: NormalizeSearchToolArgsOptions,
): T & {
  limit: number
  text_search_query?: string
  semantic_search_query?: string
} {
  const safeLimit = clampToolLimit(args.limit, options.defaultLimit, options.maxLimit)

  let text_search_query = args.text_search_query
  let semantic_search_query = args.semantic_search_query

  if (typeof args.search === 'string' && args.search.length > 0) {
    text_search_query ??= args.search
    semantic_search_query ??= args.search
  }

  return {
    ...args,
    limit: safeLimit,
    text_search_query,
    semantic_search_query,
  }
}

export function buildSearchToolSchemaProperties(options?: {
  includeSearch?: boolean
  includeTextSearch?: boolean
  includeSemanticSearch?: boolean
  includeSimilarPostId?: boolean
  includeSimilarTopicId?: boolean
  includeSimilarRssFeedItemId?: boolean
  includeLimit?: boolean
  limitDescription?: string
}): Record<string, unknown> {
  const includeSearch = options?.includeSearch ?? true
  const includeTextSearch = options?.includeTextSearch ?? true
  const includeSemanticSearch = options?.includeSemanticSearch ?? true
  const includeSimilarPostId = options?.includeSimilarPostId ?? true
  const includeSimilarTopicId = options?.includeSimilarTopicId ?? true
  const includeSimilarRssFeedItemId = options?.includeSimilarRssFeedItemId ?? true
  const includeLimit = options?.includeLimit ?? true

  return {
    ...(includeSearch && {
      search: {
        type: 'string',
        description:
          'Hybrid search shortcut. Same as setting both text_search_query and semantic_search_query to this value.',
      },
    }),
    ...(includeTextSearch && {
      text_search_query: {
        type: 'string',
        description: 'Text/keyword query for exact or lexical matching',
      },
    }),
    ...(includeSemanticSearch && {
      semantic_search_query: {
        type: 'string',
        description: 'Natural language query for semantic similarity search',
      },
    }),
    ...(includeSimilarPostId && {
      similar_post_id: {
        type: 'string',
        description: 'Find results similar to a post ID using embeddings',
      },
    }),
    ...(includeSimilarTopicId && {
      similar_topic_id: {
        type: 'string',
        description: 'Find results similar to a topic ID using embeddings',
      },
    }),
    ...(includeSimilarRssFeedItemId && {
      similar_rss_feed_item_id: {
        type: 'string',
        description: 'Find results similar to an RSS feed item UUID',
      },
    }),
    ...(includeLimit && {
      limit: {
        type: 'number',
        description: options?.limitDescription ?? 'Maximum number of results to return',
      },
    }),
  }
}
