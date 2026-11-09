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

export type PrivateCounts = {
  private_count: NonNullable<UserMetrics['private_count']>
  private_count_capped: NonNullable<UserMetrics['private_count_capped']>
}

/** Each count reads at most the cap plus one row, so a user's saved or hidden total never sets the cost. */
export async function getPrivateCounts(
  userId: string,
  options: QueryOptions,
): Promise<PrivateCounts> {
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
  const counts = {
    ...Object.fromEntries(
      RELATION_PRIVATE_COUNT_COLLECTIONS.map(collection => [
        collection.metricKey,
        toCappedCount(row?.[collection.metricKey], cap),
      ]),
    ),
    topics_viewed: toCappedCount(topicsViewed, cap),
    rss_feed_items_viewed: toCappedCount(rssFeedItemsViewed, cap),
    rss_feeds_viewed: toCappedCount(rssFeedsViewed, cap),
  }
  const entries = Object.entries(counts)

  return {
    private_count: Object.fromEntries(
      entries.map(([key, value]) => [key, value.count]),
    ) as PrivateCounts['private_count'],
    private_count_capped: Object.fromEntries(
      entries.map(([key, value]) => [key, value.capped]),
    ) as PrivateCounts['private_count_capped'],
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
  const targetJoin =
    relation.targetTable === 'posts'
      ? `JOIN LATERAL (SELECT 1 FROM posts target WHERE target.id = rel.${targetColumn}${targetDeletedFilter} LIMIT 1) matched_post ON TRUE`
      : `JOIN ${relation.targetTable} target ON target.id = rel.${targetColumn}${targetDeletedFilter}`

  return `(SELECT COUNT(*)::INT FROM (SELECT 1 FROM ${relation.tableName} rel ${targetJoin} WHERE rel.${userColumn} = $1 AND rel.deleted_at IS NULL LIMIT $2) probe) AS ${collection.metricKey}`
}
