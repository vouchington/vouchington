import sql, { type SQLStatement } from 'sql-template-strings'
import { buildSourceHead, type SourceKind } from './source-head.mts'

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

export function buildLatestCommunityActivity(
  kind: SourceKind,
  communityId: SQLStatement,
  limit: number,
  cursorSortAt?: string,
  cursorId?: string,
): SQLStatement {
  if (kind === 'feed') {
    return sql`SELECT head.sort_at AS activity_at, head.item_id AS activity_item_id FROM (`
      .append(buildCommunityList(kind, communityId, limit))
      .append(sql`) raw
        JOIN rss_feeds feed ON feed.id = raw.rss_feed_id
          AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
          AND feed.latest_item_sort_at IS NOT NULL
        LEFT JOIN LATERAL (`)
      .append(buildSourceHead(kind, sql`feed.id`, cursorSortAt, cursorId)).append(sql`) head ON TRUE
        ORDER BY head.sort_at DESC NULLS LAST, head.item_id DESC NULLS LAST,
          feed.id DESC LIMIT 1`)
  }
  return sql`SELECT head.sort_at AS activity_at, head.item_id AS activity_item_id FROM (`
    .append(buildCommunityList(kind, communityId, limit))
    .append(sql`) raw LEFT JOIN LATERAL (`)
    .append(buildSourceHead(kind, sql`raw.topic_id`, cursorSortAt, cursorId))
    .append(sql`) head ON TRUE
      ORDER BY head.sort_at DESC NULLS LAST, head.item_id DESC NULLS LAST,
        raw.topic_id DESC LIMIT 1`)
}

export function buildCommunitySources(
  kind: SourceKind,
  communityId: SQLStatement,
  followInputLimit: number,
  sourceLimit: number,
  cursorSortAt?: string,
  cursorId?: string,
): SQLStatement {
  if (kind === 'feed') {
    return sql`SELECT feed.id AS rss_feed_id FROM (`
      .append(buildCommunityList(kind, communityId, followInputLimit))
      .append(sql`) raw JOIN rss_feeds feed ON feed.id = raw.rss_feed_id
        AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
        AND feed.latest_item_sort_at IS NOT NULL
        LEFT JOIN LATERAL (`)
      .append(buildSourceHead(kind, sql`feed.id`, cursorSortAt, cursorId)).append(sql`) head ON TRUE
        ORDER BY head.sort_at DESC NULLS LAST, head.item_id DESC NULLS LAST,
          feed.id DESC LIMIT ${sourceLimit}`)
  }
  return sql`SELECT raw.topic_id FROM (`
    .append(buildCommunityList(kind, communityId, followInputLimit))
    .append(sql`) raw LEFT JOIN LATERAL (`)
    .append(buildSourceHead(kind, sql`raw.topic_id`, cursorSortAt, cursorId))
    .append(sql`) head ON TRUE
    ORDER BY head.sort_at DESC NULLS LAST, head.item_id DESC NULLS LAST,
      raw.topic_id DESC LIMIT ${sourceLimit}`)
}
