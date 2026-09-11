import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildCommunityListProxyFollowedRssFeedsCTE,
  buildCommunityListProxyFollowedTopicsCTE,
  buildCommunityListProxyMutedRssFeedsCTE,
  buildCommunityListProxyMutedTopicsCTE,
  buildCommunityListRssFeedsCTE,
  buildCommunityListTopicsCTE,
  buildExcludedCTE,
  buildExcludedHostnameIdsCTE,
  buildHiddenCTE,
} from '../../sql-builders/index.mts'

export function appendRelationCTEs(
  query: SQLStatement,
  {
    communityId,
    currentUserId,
  }: {
    communityId?: string
    currentUserId?: string
  },
): SQLStatement {
  return query
    .append(buildFollowedRssFeedsCTE({ communityId, currentUserId }))
    .append(sql`,
    `)
    .append(buildFollowedTopicsCTE({ communityId, currentUserId }))
    .append(sql`,
    `)
    .append(buildExcludedTopicsCTE(currentUserId))
    .append(sql`,
    `)
    .append(buildExcludedRssFeedsCTE(currentUserId))
    .append(sql`,
    `)
    .append(buildExcludedUsersCTE(currentUserId))
    .append(sql`,
    `)
    .append(buildHiddenItemsCTE(currentUserId))
    .append(sql`,
    `)
    .append(buildExcludedHostnamesCTE(currentUserId))
}

function buildFollowedRssFeedsCTE({
  communityId,
  currentUserId,
}: {
  communityId?: string
  currentUserId?: string
}): SQLStatement {
  return sql`/* buildFollowedCTE:fragment */
    followed_rss_feeds AS (
      `.append(
    communityId
      ? sql`SELECT feeds.rss_feed_id FROM (`
          .append(buildCommunityListRssFeedsCTE(communityId))
          .append(
            sql`) AS feeds
        JOIN rss_feeds rf_comm ON rf_comm.id = feeds.rss_feed_id
          AND rf_comm.is_enabled = TRUE AND rf_comm.deleted_at IS NULL`,
          )
      : currentUserId
        ? sql`SELECT r.object_id AS rss_feed_id
      FROM relation__user__follow__rss_feed r
      JOIN rss_feeds rf ON rf.id = r.object_id AND rf.is_enabled = TRUE AND rf.deleted_at IS NULL
      WHERE r.subject_id = ${currentUserId}
        AND r.deleted_at IS NULL
      UNION
      SELECT feeds.rss_feed_id FROM (`
            .append(buildCommunityListProxyFollowedRssFeedsCTE(currentUserId))
            .append(
              sql`) AS feeds
      JOIN rss_feeds rf_proxy ON rf_proxy.id = feeds.rss_feed_id
        AND rf_proxy.is_enabled = TRUE AND rf_proxy.deleted_at IS NULL`,
            )
        : sql`SELECT NULL::uuid AS rss_feed_id WHERE false`,
  ).append(sql`
    )`)
}

function buildFollowedTopicsCTE({
  communityId,
  currentUserId,
}: {
  communityId?: string
  currentUserId?: string
}): SQLStatement {
  return sql`/* buildFollowedCTE:fragment */
    followed_topics AS (
      `.append(
    communityId
      ? buildCommunityListTopicsCTE(communityId)
      : currentUserId
        ? sql`SELECT object_id AS topic_id
      FROM relation__user__follow__topic
      WHERE subject_id = ${currentUserId}
        AND deleted_at IS NULL
      UNION
      `.append(buildCommunityListProxyFollowedTopicsCTE(currentUserId))
        : sql`SELECT NULL::uuid AS topic_id WHERE false`,
  ).append(sql`
    )`)
}

function buildExcludedTopicsCTE(currentUserId: string | undefined): SQLStatement {
  return sql`/* buildExcludedCTE:fragment */
    excluded_topics AS (
      `.append(
    currentUserId
      ? sql`SELECT object_id AS topic_id
      FROM relation__user__mute__topic
      WHERE subject_id = ${currentUserId}
        AND deleted_at IS NULL
      UNION
      `.append(buildCommunityListProxyMutedTopicsCTE(currentUserId))
      : sql`SELECT NULL::uuid AS topic_id WHERE false`,
  ).append(sql`
    )`)
}

function buildExcludedRssFeedsCTE(currentUserId: string | undefined): SQLStatement {
  return sql`/* buildExcludedCTE:fragment */
    excluded_rss_feeds AS (
      `.append(
    currentUserId
      ? sql`SELECT object_id AS rss_feed_id
      FROM relation__user__mute__rss_feed
      WHERE subject_id = ${currentUserId}
        AND deleted_at IS NULL
      UNION
      `.append(buildCommunityListProxyMutedRssFeedsCTE(currentUserId))
      : sql`SELECT NULL::uuid AS rss_feed_id WHERE false`,
  ).append(sql`
    )`)
}

function buildExcludedUsersCTE(currentUserId: string | undefined): SQLStatement {
  return currentUserId
    ? buildExcludedCTE(
        currentUserId,
        {
          relationTable: 'relation__user__mute__user',
          idColumn: 'user_id',
          cteAlias: 'excluded_users',
        },
        ['relation__user__block__user'],
      )
    : sql`excluded_users AS (SELECT NULL::uuid AS user_id WHERE false)`
}

function buildHiddenItemsCTE(currentUserId: string | undefined): SQLStatement {
  return currentUserId
    ? buildHiddenCTE(currentUserId, {
        relationTable: 'relation__user__hide__rss_feed_item',
        idColumn: 'rss_feed_item_id',
        cteAlias: 'hidden_items',
      })
    : sql`hidden_items AS (SELECT NULL::uuid AS rss_feed_item_id WHERE false)`
}

function buildExcludedHostnamesCTE(currentUserId: string | undefined): SQLStatement {
  return currentUserId
    ? buildExcludedHostnameIdsCTE(currentUserId)
    : sql`excluded_hostname_ids AS (
            SELECT id AS hostname_id
            FROM url_hostnames
            WHERE blocked = TRUE
          )`
}
