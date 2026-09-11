import type { UrlListResponseBody } from '@/types/api-responses'

/** Backend `searchUrls` rejects queries shorter than 3 characters after trim. */
export const URL_QUERY_MIN_LENGTH = 3

export function normalizeUrlSearchQuery(query: string | undefined): string | undefined {
  const trimmed = query?.trim()
  return trimmed || undefined
}

export function isUrlSearchQueryBelowMinLength(query: unknown): boolean {
  if (typeof query !== 'string') return false
  const trimmed = query.trim()
  return trimmed.length > 0 && trimmed.length < URL_QUERY_MIN_LENGTH
}

export function emptyUrlListResponse(): UrlListResponseBody {
  return {
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}
