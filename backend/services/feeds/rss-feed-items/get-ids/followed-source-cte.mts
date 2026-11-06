import sql, { type SQLStatement } from 'sql-template-strings'

type SourceKind = 'feed' | 'topic'
type FollowedSourceOptions = {
  communityId?: string
  currentUserId?: string
  followInputLimit: number
  sourceLimit: number
}

/** Both source kinds share the bounded direct/proxy follow shape; activity lookup stays kind-specific. */
export function buildFollowedSourceCTE(
  kind: SourceKind,
  { communityId, currentUserId, followInputLimit, sourceLimit }: FollowedSourceOptions,
): SQLStatement {
  const start =
    kind === 'feed'
      ? sql`/* buildFollowedCTE:fragment */ followed_rss_feeds AS (`
      : sql`/* buildFollowedCTE:fragment */ followed_topics AS (`
  const sourceId = kind === 'feed' ? sql`rss_feed_id` : sql`topic_id`
  if (communityId) {
    start
      .append(sql`SELECT picked.`)
      .append(sourceId)
      .append(sql` FROM (`)
      .append(buildCommunitySources(kind, sql`${communityId}`, followInputLimit, sourceLimit))
      .append(sql`) picked JOIN communities community ON community.id = ${communityId}
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
      FROM (
        SELECT proxy.community_id
        FROM (
          SELECT object_id AS community_id
          FROM relation__user__proxy_follow__community
          WHERE subject_id = ${currentUserId} AND deleted_at IS NULL
          ORDER BY created_at DESC, object_id DESC LIMIT ${followInputLimit}
        ) proxy
        JOIN communities community ON community.id = proxy.community_id
          AND community.deleted_at IS NULL
        LEFT JOIN LATERAL (`)
      .append(buildLatestCommunityActivity(kind, sql`proxy.community_id`, followInputLimit))
      .append(sql`) latest ON TRUE
        WHERE community.visibility = 'public' OR EXISTS (
          SELECT 1 FROM community_members member
          WHERE member.community_id = community.id
            AND member.user_id = ${currentUserId} AND member.removed_at IS NULL
        )
        ORDER BY latest.activity_at DESC NULLS LAST, proxy.community_id DESC
        LIMIT ${sourceLimit}
      ) proxy
      CROSS JOIN LATERAL (`)
      .append(buildCommunitySources(kind, sql`proxy.community_id`, followInputLimit, sourceLimit))
      .append(sql`) child
    ) combined`)
  } else {
    start
      .append(sql`SELECT NULL::uuid AS `)
      .append(sourceId)
      .append(sql` WHERE false`)
  }
  return start.append(sql` )`)
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

function buildCommunityList(
  kind: SourceKind,
  communityId: SQLStatement,
  limit: number,
): SQLStatement {
  const query =
    kind === 'feed'
      ? sql`SELECT rss_feed_id FROM community_list_rss_feeds WHERE community_id = `
      : sql`SELECT topic_id FROM community_list_topics WHERE community_id = `
  query
    .append(communityId)
    .append(sql` AND removed_at IS NULL ORDER BY `)
    .append(kind === 'feed' ? sql`rss_feed_id` : sql`topic_id`)
    .append(sql` DESC LIMIT ${limit}`)
  return query
}

function buildLatestCommunityActivity(
  kind: SourceKind,
  communityId: SQLStatement,
  limit: number,
): SQLStatement {
  if (kind === 'feed') {
    return sql`SELECT feed.latest_item_sort_at AS activity_at FROM (`.append(
      buildCommunityList(kind, communityId, limit),
    ).append(sql`) raw
        JOIN rss_feeds feed ON feed.id = raw.rss_feed_id
          AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
        ORDER BY feed.latest_item_sort_at DESC NULLS LAST, feed.id DESC LIMIT 1`)
  }
  return sql`SELECT candidate.sort_at AS activity_at FROM (`.append(
    buildCommunityList(kind, communityId, limit),
  ).append(sql`) raw JOIN LATERAL (
      SELECT sort_at FROM rss_feed_item_topic_candidates candidate
      WHERE candidate.topic_id = raw.topic_id AND candidate.sort_at IS NOT NULL
      ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC LIMIT 1
    ) candidate ON TRUE ORDER BY candidate.sort_at DESC LIMIT 1`)
}

function buildCommunitySources(
  kind: SourceKind,
  communityId: SQLStatement,
  followInputLimit: number,
  sourceLimit: number,
): SQLStatement {
  if (kind === 'feed') {
    return sql`SELECT feed.id AS rss_feed_id FROM (`.append(
      buildCommunityList(kind, communityId, followInputLimit),
    ).append(sql`) raw JOIN rss_feeds feed ON feed.id = raw.rss_feed_id
        AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
        ORDER BY feed.latest_item_sort_at DESC NULLS LAST, feed.id DESC
        LIMIT ${sourceLimit}`)
  }
  return sql`SELECT raw.topic_id FROM (`.append(
    buildCommunityList(kind, communityId, followInputLimit),
  ).append(sql`) raw LEFT JOIN LATERAL (
      SELECT sort_at FROM rss_feed_item_topic_candidates candidate
      WHERE candidate.topic_id = raw.topic_id AND candidate.sort_at IS NOT NULL
      ORDER BY candidate.sort_at DESC, candidate.rss_feed_item_id DESC LIMIT 1
    ) latest ON TRUE
    ORDER BY latest.sort_at DESC NULLS LAST, raw.topic_id DESC
    LIMIT ${sourceLimit}`)
}
