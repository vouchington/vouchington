import sql, { type SQLStatement } from 'sql-template-strings'
import { buildTimeRangeFilter } from '@modules/feed-query-builders'
import { getTimeRangeLowerBoundDate } from '@modules/feed-query-builders/time-range'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
import type { PostSearchOptions } from './types.mts'

/** HN hot always ranks within the requested window capped at thirty elapsed days. */
export function buildPostSearchTimeRangeFilter(
  options: PostSearchOptions,
  idColumn: 'posts.id' | 'semantic_vector_post.id',
  decisionInstant: Date,
): SQLStatement | null {
  const timeRange = options.time_range ?? 'all'
  if (!usesHackerNewsHotCandidates(options))
    return buildTimeRangeFilter(timeRange, idColumn, decisionInstant)
  const requested = getTimeRangeLowerBoundDate(timeRange, decisionInstant)
  const oldestHotTimestamp = decisionInstant.getTime() - 30 * 86_400_000
  const cutoff = Math.max(requested?.getTime() ?? oldestHotTimestamp, oldestHotTimestamp)
  return sql`/* hackerNewsHotWindow:fragment */`
    .append(idColumn)
    .append(sql` >= ${timestampToUuidv7LowerBound(cutoff)}`)
}

function usesHackerNewsHotCandidates(options: PostSearchOptions): boolean {
  return (
    options.sort === 'hot' &&
    options.has_hacker_news_references === true &&
    areHackerNewsReferencesVisible()
  )
}
