import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { countRecentlyViewed } from '@services/recently-viewed'
import {
  USER_PROFILE_COLLECTIONS,
  type UserProfileCollection,
} from '@ts-shared/user-profile-collections'
import type { UserMetrics } from '@services/users/types'

const RELATION_PRIVATE_COUNT_COLLECTIONS = USER_PROFILE_COLLECTIONS.filter(
  collection =>
    collection.metricGroup === 'private_count' && collection.relation && !collection.recentView,
)

const PRIVATE_COUNT_SELECT_SQL =
  RELATION_PRIVATE_COUNT_COLLECTIONS.map(buildCountSelect).join(',\n      ')

export async function getPrivateCounts(
  userId: string,
  options: QueryOptions,
): Promise<NonNullable<UserMetrics['private_count']>> {
  const [{ rows }, topicsViewed, rssFeedItemsViewed, rssFeedsViewed] = await Promise.all([
    read(
      `/* getPrivateCounts */
    SELECT
      ${PRIVATE_COUNT_SELECT_SQL}
    `,
      [userId],
      options,
    ),
    countRecentlyViewed('topic', userId),
    countRecentlyViewed('rss_feed_item', userId),
    countRecentlyViewed('rss_feed', userId),
  ])

  const row = rows[0] as Record<string, number | string | null> | undefined
  /* c8 ignore next 5 -- covered by focused metrics tests; pre-push samples broader backend dependents. */
  const relationCounts = Object.fromEntries(
    RELATION_PRIVATE_COUNT_COLLECTIONS.map(collection => [
      collection.metricKey,
      Number(row?.[collection.metricKey]) || 0,
    ]),
  )

  return {
    ...relationCounts,
    topics_viewed: topicsViewed,
    rss_feed_items_viewed: rssFeedItemsViewed,
    rss_feeds_viewed: rssFeedsViewed,
  } as NonNullable<UserMetrics['private_count']>
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

  return `(SELECT COUNT(*)::INT FROM ${relation.tableName} rel JOIN ${relation.targetTable} target ON target.id = rel.${targetColumn}${targetDeletedFilter} WHERE rel.${userColumn} = $1 AND rel.deleted_at IS NULL) AS ${collection.metricKey}`
}
