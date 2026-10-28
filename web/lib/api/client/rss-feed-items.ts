'use client'

/**
 * RSS feed items API methods
 */

import { clientApi } from './instance'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

interface FetchRssFeedItemsOptions {
  q?: string // Search query
  limit?: number // Results per page (default: 10)
  after?: string // Cursor for pagination
  /** Embedding-ranked semantic search query; use `after` for relevance pages. */
  semantic_search_query?: string
  signal?: AbortSignal // Request cancellation signal
}

/**
 * Fetch RSS feed items with optional text or semantic search
 * GET /api/v1/rss-feed-items
 */
export async function fetchRssFeedItems(
  options: FetchRssFeedItemsOptions = {},
): Promise<RssFeedItemsFeedResponseBody> {
  return clientApi.get<RssFeedItemsFeedResponseBody>('/api/v1/rss-feed-items', {
    searchParams: {
      q: options.q,
      limit: options.limit,
      after: options.after,
      semantic_search_query: options.semantic_search_query,
    },
    signal: options.signal,
  })
}
