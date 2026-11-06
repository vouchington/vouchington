import sql, { type SQLStatement } from 'sql-template-strings'
import type { SourceKind } from './source-head.mts'
import { buildCommunitySources, buildLatestCommunityActivity } from './community-source-heads.mts'

type FollowedSourceOptions = {
  communityId?: string
  currentUserId?: string
  followInputLimit: number
  sourceLimit: number
  cursorSortAt?: string
  cursorId?: string
}

/** Both source kinds share the bounded direct/proxy follow shape; activity lookup stays kind-specific. */
export function buildFollowedSourceCTE(
  kind: SourceKind,
  {
    communityId,
    currentUserId,
    followInputLimit,
    sourceLimit,
    cursorSortAt,
    cursorId,
  }: FollowedSourceOptions,
): SQLStatement {
  const followedHeader =
    kind === 'feed'
      ? sql`/* buildFollowedCTE:fragment */ followed_rss_feeds AS (`
      : sql`/* buildFollowedCTE:fragment */ followed_topics AS (`
  const proxyRankName =
    kind === 'feed' ? sql`ranked_proxy_rss_feed_communities` : sql`ranked_proxy_topic_communities`
  const omittedName =
    kind === 'feed' ? sql`omitted_proxy_rss_feed_source` : sql`omitted_proxy_topic_source`
  const start =
    currentUserId && !communityId
      ? buildProxyCommunityRankCTE(
          kind,
          currentUserId,
          followInputLimit,
          sourceLimit,
          cursorSortAt,
          cursorId,
        )
          .append(sql`, `)
          .append(followedHeader)
      : followedHeader
  const sourceId = kind === 'feed' ? sql`rss_feed_id` : sql`topic_id`
  if (communityId) {
    start
      .append(sql`SELECT picked.`)
      .append(sourceId)
      .append(sql` FROM (`)
      .append(
        buildCommunitySources(
          kind,
          sql`${communityId}`,
          followInputLimit,
          sourceLimit + 1,
          cursorSortAt,
          cursorId,
        ),
      ).append(sql`) picked JOIN communities community ON community.id = ${communityId}
        AND community.deleted_at IS NULL`)
  } else if (currentUserId) {
    start
      .append(sql`SELECT `)
      .append(sourceId)
      .append(sql` FROM (
      SELECT direct.object_id AS `)
      .append(sourceId)
      .append(sql`
      FROM (`)
      .append(buildDirectFollows(kind, currentUserId, followInputLimit))
      .append(sql`) direct
      UNION
      SELECT child.`)
      .append(sourceId)
      .append(sql`
      FROM `)
      .append(proxyRankName)
      .append(sql` proxy
      CROSS JOIN LATERAL (`)
      .append(
        buildCommunitySources(
          kind,
          sql`proxy.community_id`,
          followInputLimit,
          sourceLimit + 1,
          cursorSortAt,
          cursorId,
        ),
      ).append(sql`) child
      WHERE proxy.community_rank <= ${sourceLimit}
    ) combined`)
  } else {
    start
      .append(sql`SELECT NULL::uuid AS `)
      .append(sourceId)
      .append(sql` WHERE false`)
  }
  start
    .append(sql` ), `)
    .append(omittedName)
    .append(sql` AS MATERIALIZED (`)
  if (currentUserId && !communityId)
    start
      .append(sql`SELECT activity_at AS sort_at, activity_item_id AS item_id
      FROM `)
      .append(proxyRankName)
      .append(sql` WHERE community_rank = ${sourceLimit + 1} AND activity_at IS NOT NULL`)
  else start.append(sql`SELECT NULL::timestamptz AS sort_at, NULL::uuid AS item_id WHERE FALSE`)
  return start.append(sql`)`)
}

function buildProxyCommunityRankCTE(
  kind: SourceKind,
  currentUserId: string,
  followInputLimit: number,
  sourceLimit: number,
  cursorSortAt?: string,
  cursorId?: string,
): SQLStatement {
  const name =
    kind === 'feed' ? sql`ranked_proxy_rss_feed_communities` : sql`ranked_proxy_topic_communities`
  return sql``
    .append(name)
    .append(sql` AS MATERIALIZED (
    SELECT ranked.*,
      row_number() OVER (ORDER BY activity_at DESC NULLS LAST,
        activity_item_id DESC NULLS LAST, community_id DESC) AS community_rank
    FROM (
      SELECT proxy.community_id, latest.activity_at, latest.activity_item_id
      FROM (
        SELECT object_id AS community_id
        FROM relation__user__proxy_follow__community
        WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
        ORDER BY created_at DESC, object_id DESC LIMIT ${followInputLimit}
      ) proxy
      JOIN communities community ON community.id = proxy.community_id
        AND community.deleted_at IS NULL
      LEFT JOIN LATERAL (`)
    .append(
      buildLatestCommunityActivity(
        kind,
        sql`proxy.community_id`,
        followInputLimit,
        cursorSortAt,
        cursorId,
      ),
    ).append(sql`) latest ON TRUE
      WHERE community.visibility = 'public' OR EXISTS (
        SELECT 1 FROM community_members member
        WHERE member.community_id = community.id AND member.user_id = ${currentUserId}
          AND member.removed_at IS NULL
      )
      ORDER BY latest.activity_at DESC NULLS LAST,
        latest.activity_item_id DESC NULLS LAST, proxy.community_id DESC
      LIMIT ${sourceLimit + 1}
    ) ranked
  )`)
}

function buildDirectFollows(kind: SourceKind, userId: string, limit: number): SQLStatement {
  return kind === 'feed'
    ? sql`SELECT object_id FROM relation__user__follow__rss_feed
        WHERE subject_id = ${userId} AND deleted_at IS NULL
        ORDER BY created_at DESC, object_id DESC LIMIT ${limit}`
    : sql`SELECT object_id FROM relation__user__follow__topic
        WHERE subject_id = ${userId} AND deleted_at IS NULL
        ORDER BY created_at DESC, object_id DESC LIMIT ${limit}`
}
