import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildCommunityListProxyMutedRssFeedsCTE,
  buildCommunityListProxyMutedTopicsCTE,
  buildExcludedCTE,
  buildHiddenCTE,
} from '../../sql-builders/index.mts'

export function appendPersonalizedExclusionCTEs(
  query: SQLStatement,
  currentUserId: string | undefined,
): SQLStatement {
  const userId = currentUserId ?? '00000000-0000-0000-0000-000000000000'
  query.append(sql`excluded_topics AS NOT MATERIALIZED (
    SELECT object_id AS topic_id FROM relation__user__mute__topic
    WHERE subject_id = ${userId} AND deleted_at IS NULL
    UNION `)
  query.append(
    currentUserId
      ? buildCommunityListProxyMutedTopicsCTE(currentUserId)
      : sql`SELECT NULL::uuid AS topic_id WHERE FALSE`,
  )
  query.append(sql`), excluded_rss_feeds AS NOT MATERIALIZED (
    SELECT object_id AS rss_feed_id FROM relation__user__mute__rss_feed
    WHERE subject_id = ${userId} AND deleted_at IS NULL
    UNION `)
  query.append(
    currentUserId
      ? buildCommunityListProxyMutedRssFeedsCTE(currentUserId)
      : sql`SELECT NULL::uuid AS rss_feed_id WHERE FALSE`,
  )
  query.append(sql`), `)
  query.append(
    currentUserId
      ? buildExcludedCTE(
          currentUserId,
          {
            relationTable: 'relation__user__mute__user',
            idColumn: 'user_id',
            cteAlias: 'excluded_users',
          },
          ['relation__user__block__user'],
        )
      : sql`excluded_users AS (SELECT NULL::uuid AS user_id WHERE FALSE)`,
  )
  query.append(sql`, `)
  query.append(
    currentUserId
      ? buildHiddenCTE(currentUserId, {
          relationTable: 'relation__user__hide__rss_feed_item',
          idColumn: 'rss_feed_item_id',
          cteAlias: 'hidden_items',
        })
      : sql`hidden_items AS (SELECT NULL::uuid AS rss_feed_item_id WHERE FALSE)`,
  )
  return query.append(sql`, excluded_hostnames AS NOT MATERIALIZED (
    SELECT hostname.reversed_hostname FROM relation__user__block__url_hostname blocked
    JOIN url_hostnames hostname ON hostname.id = blocked.object_id
    WHERE blocked.subject_id = ${userId} AND blocked.deleted_at IS NULL
    UNION
    SELECT hostname.reversed_hostname FROM relation__user__mute__url_hostname muted
    JOIN url_hostnames hostname ON hostname.id = muted.object_id
    WHERE muted.subject_id = ${userId} AND muted.deleted_at IS NULL
  )`)
}
