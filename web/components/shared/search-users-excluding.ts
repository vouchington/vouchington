import { searchUsers } from '@/lib/api/client/users'
import type { UserSearchResult } from '@/types/user'

const PAGE_LIMIT = 10

/**
 * Safety bound on additional pages fetched per search. A client-side exclusion filter
 * (already-selected participants/recipients) can consume an entire page of results, which
 * would otherwise render an empty dropdown despite real matches existing further in the
 * cursor. This caps the fan-out from a single debounced keystroke while still following
 * page_info instead of silently truncating at page one.
 */
const MAX_ADDITIONAL_PAGES = 4

/**
 * Searches users and filters out already-selected/excluded ids client-side, following
 * `page_info.has_next_page` until there are enough visible matches, the result set is
 * exhausted, or the page-count safety bound is hit.
 */
export async function searchUsersExcluding(
  query: string,
  excludeIds: ReadonlySet<string>,
  options: { signal?: AbortSignal; minResults?: number } = {},
): Promise<UserSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const minResults = options.minResults ?? PAGE_LIMIT
  const matches: UserSearchResult[] = []
  let after: string | undefined

  for (let page = 0; page <= MAX_ADDITIONAL_PAGES; page++) {
    // oxlint-disable-next-line no-await-in-loop -- each page's cursor depends on the previous page's end_cursor, so requests must stay sequential.
    const response = await searchUsers({
      q: trimmed,
      after,
      limit: PAGE_LIMIT,
      signal: options.signal,
    })
    for (const user of response.results) {
      if (!excludeIds.has(user.id)) matches.push(user)
    }
    if (
      matches.length >= minResults ||
      !response.page_info.has_next_page ||
      !response.page_info.end_cursor
    ) {
      break
    }
    after = response.page_info.end_cursor
  }

  return matches
}
