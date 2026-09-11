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
  if (!options.includePlatform) {
    const query = sql`/* listUserRemovedPosts */
    SELECT
      cpr.post_id,
      NULLIF(BTRIM(p.title), '') AS post_title,
      p.declared_language AS post_declared_language,
      p.lingua_rs_detected_language AS post_lingua_rs_detected_language,
      cpr.community_id,
      c.slug AS community_slug,
      to_char(cpr.unpublished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS unpublished_at,
      0 AS removal_tier,
      'community' AS post_removal_kind
    FROM community_post_reviews cpr
    JOIN posts p ON p.id = cpr.post_id AND p.deleted_at IS NULL
    JOIN communities c ON c.id = cpr.community_id
    WHERE cpr.submitted_by_id = ${userId}
      AND p.created_by_id = ${userId}
      AND cpr.unpublished_at IS NOT NULL
  `

    if (options.cursor) {
      query.append(
        sql` AND (cpr.unpublished_at < ${options.cursor.timestamp}::timestamptz
             OR (cpr.unpublished_at = ${options.cursor.timestamp}::timestamptz AND cpr.post_id < ${options.cursor.id}))`,
      )
    }

    query.append(sql`
    ORDER BY cpr.unpublished_at DESC, cpr.post_id DESC
    LIMIT ${options.limit + 1}
  `)
    return query
  }

  const platformPostsQuery = sql`
    SELECT
      p.id AS post_id,
      NULLIF(BTRIM(p.title), '') AS post_title,
      p.declared_language AS post_declared_language,
      p.lingua_rs_detected_language AS post_lingua_rs_detected_language,
      p.community_id,
      c.slug AS community_slug,
      p.rejected_at AS removed_at,
      1 AS removal_tier,
      'platform'::TEXT AS post_removal_kind
    FROM posts p
    LEFT JOIN communities c ON c.id = p.community_id
    WHERE p.created_by_id = ${userId}
      AND p.deleted_at IS NULL
      AND p.rejected_at IS NOT NULL
  `
  const communityPostsQuery = sql`
    SELECT
      cpr.post_id,
      NULLIF(BTRIM(p.title), '') AS post_title,
      p.declared_language AS post_declared_language,
      p.lingua_rs_detected_language AS post_lingua_rs_detected_language,
      cpr.community_id,
      c.slug AS community_slug,
      cpr.unpublished_at AS removed_at,
      0 AS removal_tier,
      'community'::TEXT AS post_removal_kind
    FROM community_post_reviews cpr
    JOIN posts p ON p.id = cpr.post_id
    JOIN communities c ON c.id = cpr.community_id
    WHERE cpr.submitted_by_id = ${userId}
      AND p.created_by_id = ${userId}
      AND p.deleted_at IS NULL
      AND cpr.unpublished_at IS NOT NULL
  `
  if (options.cursor) {
    const cursor = options.cursor as ScopedTierPreciseUuidCursor
    platformPostsQuery.append(sql`
      AND (
        p.rejected_at < ${cursor.timestamp}::timestamptz
        OR (
          p.rejected_at = ${cursor.timestamp}::timestamptz
          AND (1 < ${cursor.tier} OR (1 = ${cursor.tier} AND p.id < ${cursor.id}))
        )
      )
    `)
    communityPostsQuery.append(sql`
      AND (
        cpr.unpublished_at < ${cursor.timestamp}::timestamptz
        OR (
          cpr.unpublished_at = ${cursor.timestamp}::timestamptz
          AND (0 < ${cursor.tier} OR (0 = ${cursor.tier} AND cpr.post_id < ${cursor.id}))
        )
      )
    `)
  }
  platformPostsQuery.append(sql`ORDER BY p.rejected_at DESC, p.id DESC
    LIMIT ${options.limit + 1}
  `)
  communityPostsQuery.append(sql`ORDER BY cpr.unpublished_at DESC, cpr.post_id DESC
    LIMIT ${options.limit + 1}
  `)

  const query = sql`/* listUserRemovedPosts */
    WITH platform_removed_posts AS (
  `
  query.append(platformPostsQuery)
  query.append(sql`
    ),
    community_removed_posts AS (
  `)
  query.append(communityPostsQuery)
  query.append(sql`
    ),
    removed_posts AS (
      SELECT * FROM platform_removed_posts
      UNION ALL
      SELECT * FROM community_removed_posts
    )
    SELECT
      post_id,
      post_title,
      post_declared_language,
      post_lingua_rs_detected_language,
      community_id,
      community_slug,
      to_char(removed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS unpublished_at,
      removal_tier,
      post_removal_kind
    FROM removed_posts
  `)
  query.append(sql`ORDER BY removed_at DESC, removal_tier DESC, post_id DESC
    LIMIT ${options.limit + 1}
  `)
  return query
}
