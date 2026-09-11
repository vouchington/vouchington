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
          WITH platform_removed_posts AS (

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
          WHERE p.created_by_id = $1
            AND p.deleted_at IS NULL
            AND p.rejected_at IS NOT NULL
        ORDER BY p.rejected_at DESC, p.id DESC
          LIMIT $2

          ),
          community_removed_posts AS (

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
          WHERE cpr.submitted_by_id = $3
            AND p.created_by_id = $4
            AND p.deleted_at IS NULL
            AND cpr.unpublished_at IS NOT NULL
        ORDER BY cpr.unpublished_at DESC, cpr.post_id DESC
          LIMIT $5

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
        ORDER BY removed_at DESC, removal_tier DESC, post_id DESC
          LIMIT $6"
    `)
    expect(query.values).toEqual([userId, 26, userId, userId, 26, 26])
  })
})
