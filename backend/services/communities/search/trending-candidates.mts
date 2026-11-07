import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import { getMinUUIDv7ForDate } from '@modules/utils'

// "Trending" means recently active, not all-time popular — and CI runs every test against one
// shared, continuously-growing database rather than an isolated one per test, so the candidate
// cap (not just the window) is what keeps this query's cost bounded instead of O(all communities).
export const TRENDING_WINDOW_DAYS = 30
export const TRENDING_CANDIDATE_LIMIT = 1000

/**
 * The CTE chain that scores trending communities, ending in a `scored` CTE of
 * (id, trending_score). The caller prefixes `WITH` and any earlier CTEs, and reads `scored`.
 *
 * Candidates are the top TRENDING_CANDIDATE_LIMIT communities by recent post activity;
 * members/follows/mutes are then aggregated only for those candidates, so cost is a function
 * of the cap instead of total community count. A community with no posts in the window never
 * becomes a candidate, however many members/follows/mutes it has.
 *
 * These are set-based equivalents of the view_community_metrics counts. That view's correlated
 * per-community subqueries cannot apply LIMIT until every public community is scored.
 */
export function trendingCommunityScoreCtes(): SQLStatement {
  const windowCutoffDate = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const postCutoffId = getMinUUIDv7ForDate(windowCutoffDate)

  const ctes = sql`candidate_reviewed_posts AS (
      -- Eligibility is inlined via buildPublicPostEligibilityFilter (not joined to
      -- view_public_post_eligibility, itself NOT MATERIALIZED) so it runs against this
      -- CTE's own bounded scan instead of being evaluated once per row of the whole table.
      SELECT p.id, p.community_id
      FROM posts p
      INNER JOIN community_post_reviews cpr
        ON cpr.post_id = p.id
        AND cpr.community_id = p.community_id
        AND cpr.approved_at IS NOT NULL
        AND cpr.unpublished_at IS NULL
        AND cpr.rejected_at IS NULL
      JOIN posts access_post ON access_post.id = COALESCE(p.root_post_id, p.id)
      WHERE p.community_id IS NOT NULL
        AND p.id >= ${postCutoffId}
        AND `

  ctes.append(buildPublicPostEligibilityFilter('p', 'access_post'))

  return ctes.append(sql`
    ),
    windowed_post_counts AS (
      SELECT community_id, COUNT(*)::int AS post_count
      FROM candidate_reviewed_posts
      GROUP BY community_id
    ),
    candidates AS (
      SELECT community_id, post_count
      FROM windowed_post_counts
      ORDER BY post_count DESC, community_id DESC
      LIMIT ${TRENDING_CANDIDATE_LIMIT}
    ),
    member_counts AS (
      SELECT cm.community_id, COUNT(*)::int AS member_count
      FROM community_members cm
      INNER JOIN candidates cand ON cand.community_id = cm.community_id
      WHERE cm.removed_at IS NULL
      GROUP BY cm.community_id
    ),
    proxy_follow_counts AS (
      SELECT r.object_id AS community_id, COUNT(*)::int AS proxy_follow_count
      FROM relation__user__proxy_follow__community r
      INNER JOIN candidates cand ON cand.community_id = r.object_id
      WHERE r.deleted_at IS NULL
        AND r.created_at >= ${windowCutoffDate}
      GROUP BY r.object_id
    ),
    proxy_mute_counts AS (
      SELECT r.object_id AS community_id, COUNT(*)::int AS proxy_mute_count
      FROM relation__user__proxy_mute__community r
      INNER JOIN candidates cand ON cand.community_id = r.object_id
      WHERE r.deleted_at IS NULL
        AND r.created_at >= ${windowCutoffDate}
      GROUP BY r.object_id
    ),
    scored AS (
      SELECT
        c.id,
        (
          COALESCE(mc.member_count, 0)
          + COALESCE(cand.post_count, 0)
          + COALESCE(pf.proxy_follow_count, 0)
          + COALESCE(pm.proxy_mute_count, 0)
        )::DOUBLE PRECISION AS trending_score
      FROM candidates cand
      INNER JOIN communities c ON c.id = cand.community_id
      LEFT JOIN member_counts mc ON mc.community_id = c.id
      LEFT JOIN proxy_follow_counts pf ON pf.community_id = c.id
      LEFT JOIN proxy_mute_counts pm ON pm.community_id = c.id
      WHERE c.deleted_at IS NULL
        AND c.visibility = 'public'
    )`)
}

/**
 * The candidate query for sort=trending: the scored candidates joined to communities, before the
 * shared filters, hydration and keyset tail. Only the filters that exist for it apply: q, member_id
 * and has_list_items.
 */
export function startTrendingCommunityCandidates(
  hasListItems: boolean,
  search?: string,
  memberUserId?: string,
): SQLStatement {
  const query = sql`/* searchCommunities */ WITH `
  if (search)
    query.append(sql`search_matches AS MATERIALIZED (
      SELECT id FROM communities
      WHERE deleted_at IS NULL
        AND search_vector @@ websearch_to_tsquery('voucha_english', ${search})
    ), `)
  if (memberUserId)
    query.append(sql`member_matches AS MATERIALIZED (
      SELECT community_id AS id FROM community_members
      WHERE user_id = ${memberUserId} AND removed_at IS NULL
    ), `)
  query.append(trendingCommunityScoreCtes()).append(sql`,
    candidate_communities AS MATERIALIZED (
      SELECT c.id, c.name, trending.trending_score
      FROM scored trending
      JOIN communities c ON c.id = trending.id`)
  if (search) query.append(sql` JOIN search_matches matched ON matched.id = c.id`)
  if (memberUserId) query.append(sql` JOIN member_matches member_match ON member_match.id = c.id`)
  if (hasListItems)
    query.append(sql` JOIN community_search_counts counts ON counts.community_id = c.id`)
  return query.append(sql` WHERE c.deleted_at IS NULL`)
}
