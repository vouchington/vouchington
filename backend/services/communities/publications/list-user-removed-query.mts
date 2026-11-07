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
    WITH review_page AS MATERIALIZED (
      SELECT cpr.post_id, cpr.community_id, cpr.unpublished_at
      FROM community_post_reviews cpr
      WHERE cpr.submitted_by_id = ${userId}
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
    )
    SELECT
      page.post_id,
      NULLIF(BTRIM(p.title), '') AS post_title,
      p.declared_language AS post_declared_language,
      p.lingua_rs_detected_language AS post_lingua_rs_detected_language,
      page.community_id,
      c.slug AS community_slug,
      to_char(page.unpublished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS unpublished_at,
      0 AS removal_tier,
      'community' AS post_removal_kind,
      (p.id IS NOT NULL) AS kept
    FROM review_page page
  `)
    appendLiveAuthorPost(query, userId)
    query.append(sql`
    LEFT JOIN communities c ON c.id = page.community_id
    ORDER BY page.unpublished_at DESC, page.post_id DESC
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
      'platform'::TEXT AS post_removal_kind,
      TRUE AS kept
    -- no-mistakes-disable-next-line postgres-required-predicates: posts are selected by author with no time window; an author id does not bound post ids (seeded posts predate their author, and author deletion reassigns created_by_id), so every id partition is read through idx_posts__default__created_by_rejected_at_id
    FROM posts p
    LEFT JOIN communities c ON c.id = p.community_id
    WHERE p.created_by_id = ${userId}
      AND p.deleted_at IS NULL
      AND p.rejected_at IS NOT NULL
  `
  const reviewPageQuery = sql`
    SELECT cpr.post_id, cpr.community_id, cpr.unpublished_at
    FROM community_post_reviews cpr
    WHERE cpr.submitted_by_id = ${userId}
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
    reviewPageQuery.append(sql`
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
  reviewPageQuery.append(sql`
    ORDER BY cpr.unpublished_at DESC, cpr.post_id DESC
    LIMIT ${options.limit + 1}
  `)

  const query = sql`/* listUserRemovedPosts */
    WITH review_page AS MATERIALIZED (
  `
  query.append(reviewPageQuery)
  query.append(sql`
    ), platform_removed_posts AS (
  `)
  query.append(platformPostsQuery)
  query.append(sql`
    ), community_removed_posts AS (
      SELECT
        page.post_id,
        NULLIF(BTRIM(p.title), '') AS post_title,
        p.declared_language AS post_declared_language,
        p.lingua_rs_detected_language AS post_lingua_rs_detected_language,
        page.community_id,
        c.slug AS community_slug,
        page.unpublished_at AS removed_at,
        0 AS removal_tier,
        'community'::TEXT AS post_removal_kind,
        (p.id IS NOT NULL) AS kept
      FROM review_page page
  `)
  appendLiveAuthorPost(query, userId)
  query.append(sql`
      LEFT JOIN communities c ON c.id = page.community_id
    ), removed_posts AS (
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
      post_removal_kind,
      kept
    FROM removed_posts
    ORDER BY removed_at DESC, removal_tier DESC, post_id DESC
    LIMIT ${options.limit + 1}
  `)
  return query
}

/** One post-id lookup. created_by_id stays here so a reassigned author is not returned. */
function appendLiveAuthorPost(query: SQLStatement, userId: string): void {
  query.append(sql`
    LEFT JOIN LATERAL (
      SELECT p.id, p.title, p.declared_language, p.lingua_rs_detected_language
      FROM posts p
      WHERE p.id = page.post_id
        AND p.deleted_at IS NULL
        AND p.created_by_id = ${userId}
      LIMIT 1
    ) p ON TRUE`)
}
