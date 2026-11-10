import sql, { type SQLStatement } from 'sql-template-strings'
import { buildTimeRangeFilter } from '@modules/feed-query-builders'
import { getTimeRangeLowerBoundDate } from '@modules/feed-query-builders/time-range'
import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
import { buildStablePostHotRankExpression } from './stable-hot-rank.mts'
import type { PostSearchOptions } from './types.mts'

/**
 * The rank leaf loses to an empty id index plus a sort when eligibility is cheap.
 * This upper bound is always true and makes the rank expression an index condition.
 */
export function appendHackerNewsHotRankBound(
  filters: SQLStatement[],
  options: PostSearchOptions,
): void {
  if (!usesHackerNewsHotCandidates(options)) return
  const bound = sql`(`
  bound.append(buildStablePostHotRankExpression())
  bound.append(
    sql`, posts.id) < (1e300::DOUBLE PRECISION, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)`,
  )
  filters.push(bound)
}

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
  // A bare id comparison lets a cheap admin plan prune to the id index and skip the rank leaf.
  // The timestamp test keeps the same thirty-day window without becoming an id index condition.
  return sql`/* hackerNewsHotWindow:fragment */ uuid_extract_timestamp(`
    .append(idColumn)
    .append(sql`) >= ${new Date(cutoff)}`)
}

function usesHackerNewsHotCandidates(options: PostSearchOptions): boolean {
  return (
    options.sort === 'hot' &&
    options.has_hacker_news_references === true &&
    areHackerNewsReferencesVisible()
  )
}
