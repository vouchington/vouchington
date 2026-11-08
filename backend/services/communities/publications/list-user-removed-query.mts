import type { ScopedPreciseTimestampCursor, ScopedTierPreciseUuidCursor } from '@modules/pagination'
import sql, { type SQLStatement } from 'sql-template-strings'

type BuildUserRemovedPostsQueryOptions = {
  limit: number
  includePlatform: boolean
  cursor?: ScopedPreciseTimestampCursor | ScopedTierPreciseUuidCursor
}

export function buildUserRemovedPostsQuery(
  userId: string,
  options: BuildUserRemovedPostsQueryOptions,
): SQLStatement {
  const communityPosts = sql`
    SELECT cpr.post_id, cpr.community_id, cpr.unpublished_at AS removed_at,
      0 AS removal_tier, 'community'::text AS post_removal_kind
    FROM community_post_reviews cpr
    WHERE cpr.submitted_by_id = ${userId}
      AND cpr.unpublished_at IS NOT NULL
      AND (SELECT TRUE FROM posts eligible_post
        WHERE eligible_post.id = cpr.post_id
          AND eligible_post.created_by_id = ${userId}
          AND eligible_post.deleted_at IS NULL
      ) = TRUE
  `
  appendRemovalCursor(communityPosts, sql`cpr.unpublished_at`, sql`cpr.post_id`, 0, options)

  communityPosts.append(
    sql` ORDER BY cpr.unpublished_at DESC, cpr.post_id DESC LIMIT ${options.limit + 1}`,
  )

  const query = sql`/* listUserRemovedPosts */ SELECT page.post_id,
    NULLIF(BTRIM(p.title), '') AS post_title,
    p.declared_language AS post_declared_language,
    p.lingua_rs_detected_language AS post_lingua_rs_detected_language,
    page.community_id, c.slug AS community_slug,
    to_char(page.removed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS unpublished_at,
    page.removal_tier, page.post_removal_kind
    FROM (SELECT * FROM (`
  if (options.includePlatform) {
    const platformPosts = sql`
      SELECT p.id AS post_id, p.community_id, p.rejected_at AS removed_at,
        1 AS removal_tier, 'platform'::text AS post_removal_kind
      -- no-mistakes-disable-next-line postgres-required-predicates: author deletion can reassign created_by_id, so author identity does not bound post ids; all partitions use the author/removal index
      FROM posts p
      WHERE p.created_by_id = ${userId}
        AND p.deleted_at IS NULL
        AND p.rejected_at IS NOT NULL
    `
    appendRemovalCursor(platformPosts, sql`p.rejected_at`, sql`p.id`, 1, options)
    platformPosts.append(sql` ORDER BY p.rejected_at DESC, p.id DESC LIMIT ${options.limit + 1}`)
    query
      .append(sql`(`)
      .append(platformPosts)
      .append(sql`) UNION ALL (`)
    query.append(communityPosts).append(sql`)`)
  } else query.append(communityPosts)
  query.append(sql`) removed_posts
    ORDER BY removed_at DESC, removal_tier DESC, post_id DESC
    LIMIT ${options.limit + 1}) page
    INNER JOIN posts p ON p.id = page.post_id
    LEFT JOIN communities c ON c.id = page.community_id
    ORDER BY page.removed_at DESC, page.removal_tier DESC, page.post_id DESC`)
  return query
}

function appendRemovalCursor(
  query: SQLStatement,
  timestamp: SQLStatement,
  id: SQLStatement,
  tier: 0 | 1,
  options: BuildUserRemovedPostsQueryOptions,
): void {
  const cursor = options.cursor
  if (!cursor) return
  query
    .append(sql` AND (`)
    .append(timestamp)
    .append(sql` < ${cursor.timestamp}::timestamptz OR (`)
  query.append(timestamp).append(sql` = ${cursor.timestamp}::timestamptz AND `)
  if (options.includePlatform) {
    const tierCursor = cursor as ScopedTierPreciseUuidCursor
    query.append(sql`(${tier} < ${tierCursor.tier} OR (${tier} = ${tierCursor.tier} AND `)
    query.append(id).append(sql` < ${cursor.id}))))`)
  } else query.append(id).append(sql` < ${cursor.id}))`)
}
