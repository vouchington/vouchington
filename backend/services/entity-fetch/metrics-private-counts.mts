import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { countRecentlyViewed } from '@services/recently-viewed'
import {
  USER_PROFILE_COLLECTIONS,
  type UserProfileCollection,
} from '@ts-shared/user-profile-collections'
import type { UserMetrics } from '@services/users/types'
import {
  getProfileCountCap,
  profileCountProbeLimit,
  toCappedCount,
} from '@services/users/profile-count-cap'

const RELATION_PRIVATE_COUNT_COLLECTIONS = USER_PROFILE_COLLECTIONS.filter(
  collection =>
    collection.metricGroup === 'private_count' && collection.relation && !collection.recentView,
)

const PRIVATE_COUNT_SELECT_SQL =
  RELATION_PRIVATE_COUNT_COLLECTIONS.map(buildCountSelect).join(',\n      ')

export async function getPrivateCounts(
  userId: string,
  options: QueryOptions,
): Promise<{
  counts: NonNullable<UserMetrics['private_count']>
  capped: NonNullable<UserMetrics['private_count_capped']>
}> {
  const cap = getProfileCountCap()
  const [{ rows }, topicsViewed, rssFeedItemsViewed, rssFeedsViewed] = await Promise.all([
    read(
      `/* getPrivateCounts */
    SELECT
      ${PRIVATE_COUNT_SELECT_SQL}
    `,
      [userId, profileCountProbeLimit(cap)],
      options,
    ),
    countRecentlyViewed('topic', userId),
    countRecentlyViewed('rss_feed_item', userId),
    countRecentlyViewed('rss_feed', userId),
  ])

  const row = rows[0] as Record<string, number | string | null> | undefined
  const rawCounts = {
    ...Object.fromEntries(
      RELATION_PRIVATE_COUNT_COLLECTIONS.map(collection => [
        collection.metricKey,
        row?.[collection.metricKey],
      ]),
    ),
    topics_viewed: topicsViewed,
    rss_feed_items_viewed: rssFeedItemsViewed,
    rss_feeds_viewed: rssFeedsViewed,
  }
  const entries = Object.entries(rawCounts).map(
    ([key, value]) => [key, toCappedCount(value, cap)] as const,
  )
  return {
    counts: Object.fromEntries(entries.map(([key, value]) => [key, value.count])) as NonNullable<
      UserMetrics['private_count']
    >,
    capped: Object.fromEntries(entries.map(([key, value]) => [key, value.capped])) as NonNullable<
      UserMetrics['private_count_capped']
    >,
  }
}

function buildCountSelect(collection: UserProfileCollection): string {
  const relation = collection.relation
  /* c8 ignore next 3 -- RELATION_PRIVATE_COUNT_COLLECTIONS is prefiltered to relation-backed entries. */
  if (!relation) {
    throw new Error(`Collection ${collection.id} does not have relation metadata`)
  }
  const targetDeletedFilter = relation.targetDeletedAtFilter ? ' AND target.deleted_at IS NULL' : ''
  const userColumn = relation.direction === 'subject' ? 'object_id' : 'subject_id'
  /* c8 ignore next -- no current owner-only private counts use subject-directed relations. */
  const targetColumn = relation.direction === 'subject' ? 'subject_id' : 'object_id'
  // Keep the owner relation as the walk; each candidate probes exactly one target key.
  const targetJoin = `JOIN LATERAL (SELECT 1 FROM ${relation.targetTable} target WHERE target.id = rel.${targetColumn}${targetDeletedFilter} LIMIT 1) matched_target ON TRUE`

  return `(SELECT COUNT(*)::INT FROM (SELECT 1 FROM ${relation.tableName} rel ${targetJoin} WHERE rel.${userColumn} = $1 AND rel.deleted_at IS NULL ORDER BY rel.${targetColumn} LIMIT $2) probe) AS ${collection.metricKey}`
}
