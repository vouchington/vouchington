import { createSearchCache } from '@services/entity-cache/search-cache'
import { clampLimit } from '@services/pagination'
import { read } from '@data-stores/psql'
import { sliceRawKeysetPage } from '@modules/pagination'
import { getMinUUIDv7ForDate } from '@modules/utils'
import assert from 'http-assert'
import type { ViewUrl } from '@services/urls/types'
import { getWebSearchChunkCap } from './config.mts'
import {
  decodeWebSearchCursor,
  encodeWebSearchCursor,
  getWebSearchCursorScope,
  type WebSearchCursor,
} from './cursor.mts'
import { buildWebSearchQuery } from './query.mts'
import type { WebSearchOptions, WebSearchResponse, WebSearchResult } from './types.mts'

type WebSearchRow = ViewUrl & {
  cursor_score: number | null
  snippet: string | null
  match_type: 'content' | 'url'
}

/**
 * Full-text search over crawled pages and URL-string match.
 *
 * Validity and freshness conditions stay inside the ranked chunk walk. Only the top
 * `chunk_cap` chunks by rank compete for the best chunk per URL; a URL matched only below that
 * cap can still appear as a URL match.
 */
export async function searchWeb(options: WebSearchOptions): Promise<WebSearchResponse> {
  const query = options.query.trim()
  assert(query.length >= 3, 400, 'Web search query must be at least 3 characters')

  const scope = getWebSearchCursorScope(query)
  const cursor = options.after === undefined ? null : decodeWebSearchCursor(options.after, scope)
  const recentCrawlCutoffId = getMinUUIDv7ForDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  const escapedQuery = query.replace(/[\\%_]/g, '\\$&')
  const safeLimit = Math.trunc(clampLimit(options.limit, 100))

  const { rows } = await read(
    buildWebSearchQuery({
      query,
      likeQuery: `%${escapedQuery}%`,
      recentCrawlCutoffId,
      chunkCap: getWebSearchChunkCap(),
      fetchLimit: safeLimit + 1,
      contentScore: cursor?.tier === 'content' ? cursor.score : null,
      contentId: cursor?.tier === 'content' ? cursor.id : null,
      skipContent: cursor?.tier === 'url',
      urlCursorId: cursor?.tier === 'url' ? cursor.id : null,
    }),
  )

  const { window, hasMore } = sliceRawKeysetPage(rows as WebSearchRow[], safeLimit)
  const results: WebSearchResult[] = window.map(
    ({ cursor_score: _score, snippet, match_type, ...url }) => ({
      url: url as ViewUrl,
      snippet,
      match_type,
    }),
  )
  const cursorFor = (row: WebSearchRow): string => encodeWebSearchCursor(toCursor(row), scope)

  return {
    results,
    page_info: {
      has_next_page: hasMore,
      start_cursor: window[0] ? cursorFor(window[0]) : null,
      end_cursor: hasMore && window.at(-1) ? cursorFor(window.at(-1)!) : null,
    },
  }
}

function toCursor(row: WebSearchRow): WebSearchCursor {
  return row.match_type === 'content' && row.cursor_score !== null
    ? { tier: 'content', score: row.cursor_score, id: row.id }
    : { tier: 'url', id: row.id }
}

export const searchWebCached = createSearchCache('web_search_anon', searchWeb)
