import { describe, expect, it } from 'vitest'
import { buildUserRemovedPostsQuery } from './list-user-removed-query.mts'

describe('buildUserRemovedPostsQuery', () => {
  it('builds one bounded owner-scoped union query', () => {
    const userId = '01910000-0000-7000-8000-000000000001'
    const query = buildUserRemovedPostsQuery(userId, {
      includePlatform: true,
      limit: 25,
    })

    expect(query.text.replace(/^[ \t]+$/gm, '').trimEnd()).toMatchInlineSnapshot(`
      "/* listUserRemovedPosts */
          WITH review_page AS MATERIALIZED (

          SELECT cpr.post_id, cpr.community_id, cpr.unpublished_at
          FROM community_post_reviews cpr
          WHERE cpr.submitted_by_id = $1
            AND cpr.unpublished_at IS NOT NULL

          ORDER BY cpr.unpublished_at DESC, cpr.post_id DESC
          LIMIT $2

          ), platform_removed_posts AS (

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
          WHERE p.created_by_id = $3
            AND p.deleted_at IS NULL
            AND p.rejected_at IS NOT NULL
        ORDER BY p.rejected_at DESC, p.id DESC
          LIMIT $4

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

          LEFT JOIN LATERAL (
            SELECT p.id, p.title, p.declared_language, p.lingua_rs_detected_language
            FROM posts p
            WHERE p.id = page.post_id
              AND p.deleted_at IS NULL
              AND p.created_by_id = $5
            LIMIT 1
          ) p ON TRUE
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
          LIMIT $6"
    `)
    expect(query.values).toEqual([userId, 26, userId, 26, userId, 26])
  })
})
