import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildCommunityListProxyMutedRssFeedsCTE,
  buildCommunityListProxyMutedTopicsCTE,
  buildExcludedHostnameIdsCTE,
  buildHiddenCTE,
} from '../../sql-builders/index.mts'
import { appendPersonalizedExclusionCTEs } from './personalized-exclusions.mts'
import { buildFollowedRssFeedsCTE } from './followed-rss-feeds-cte.mts'
import { buildFollowedTopicsCTE } from './followed-topics-cte.mts'

export function appendRelationCTEs(
  query: SQLStatement,
  {
    communityId,
    currentUserId,
    followInputLimit,
    proxyFollowInputLimit,
    communityListInputLimit,
    cutoffDate,
    itemCutoffId,
    sourceLimit,
    exclusionRelationLimit,
    cursorSortAt,
    cursorId,
    cursorInclusive,
  }: {
    communityId?: string
    currentUserId?: string
    proxyFollowInputLimit: number
    communityListInputLimit: number
    cutoffDate: Date | null
    itemCutoffId: string | null
    followInputLimit: number
    sourceLimit: number
    exclusionRelationLimit: number
    cursorSortAt?: string
    cursorId?: string
    cursorInclusive?: boolean
  },
): SQLStatement {
  return query
    .append(sql`viewer_proxy_follows AS MATERIALIZED (
      SELECT object_id AS community_id, created_at
      FROM relation__user__proxy_follow__community
      WHERE subject_id = ${currentUserId ?? '00000000-0000-0000-0000-000000000000'}
        AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC
      LIMIT ${proxyFollowInputLimit + 1}
    ), `)
    .append(
      buildFollowedRssFeedsCTE({
        communityId,
        currentUserId,
        followInputLimit,
        proxyFollowInputLimit,
        communityListInputLimit,
        cutoffDate,
        itemCutoffId,
        sourceLimit,
        cursorSortAt,
        cursorId,
        cursorInclusive,
      }),
    )
    .append(sql`,
    `)
    .append(
      buildFollowedTopicsCTE({
        communityId,
        currentUserId,
        followInputLimit,
        proxyFollowInputLimit,
        communityListInputLimit,
        cutoffDate,
        itemCutoffId,
        sourceLimit,
        cursorSortAt,
        cursorId,
        cursorInclusive,
      }),
    )
    .append(sql`,
    `)
    .append(appendPersonalizedExclusionCTEs(sql``, currentUserId, exclusionRelationLimit))
}

export function appendRssFeedItemViewerCTEs(
  query: SQLStatement,
  currentUserId: string | undefined,
): SQLStatement {
  return query
    .append(buildExcludedTopicsCTE(currentUserId))
    .append(sql`, `)
    .append(buildExcludedRssFeedsCTE(currentUserId))
    .append(sql`, `)
    .append(buildHiddenItemsCTE(currentUserId))
    .append(sql`, `)
    .append(buildExcludedHostnamesCTE(currentUserId))
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
    : sql`excluded_hostname_ids AS (SELECT NULL::uuid AS hostname_id WHERE false)`
}
