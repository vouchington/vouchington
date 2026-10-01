import { resolveHashtagTopicSearch } from '@services/search-params'

export type CommunityHashtagQuery = {
  /** The text left after the hashtags are taken out; `undefined` when `q` held only hashtags. */
  search?: string
  /** Topics the hashtags in `q` link to. */
  topicIds: string[]
  /** True when a hashtag names no topic or is an exact alias, so no community can match. */
  hashtagHasNoMatches: boolean
}

/**
 * Splits a community search `q` into its text and hashtag parts, as `GET /communities` reads it.
 * A malformed or excessive hashtag list is a 422 from the hashtag resolver.
 */
export async function resolveCommunityHashtagQuery(
  rawQuery: unknown,
): Promise<CommunityHashtagQuery> {
  const result = await resolveHashtagTopicSearch(rawQuery)
  return {
    search: result.textSearchQuery,
    topicIds: result.topicIds,
    hashtagHasNoMatches:
      result.hasUnknown || result.filters.some(filter => filter.kind === 'exact_alias'),
  }
}
