import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { clampLimit } from '@modules/search-utils'
import { decodeUuidCursor, isScoreCursor, buildPageInfo } from '@modules/pagination'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import type {
  TrendingCommunityOptions,
  TrendingCommunitiesResult,
  TrendingCommunity,
} from './types.mts'

const DEFAULT_LIMIT = 10

// "Trending" means recently active, not all-time popular — and CI runs every test against one
// shared, continuously-growing database rather than an isolated one per test, so the candidate
// cap (not just the window) is what keeps this query's cost bounded instead of O(all communities).
export const TRENDING_WINDOW_DAYS = 30
export const TRENDING_CANDIDATE_LIMIT = 1000

type TrendingCommunitiesDependencies = {
  read: typeof read
}
const defaultDependencies: TrendingCommunitiesDependencies = { read }

export async function getTrendingCommunities(
  options: TrendingCommunityOptions,
  dependencyOverrides: Partial<TrendingCommunitiesDependencies> = {},
): Promise<TrendingCommunitiesResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const { limit, after } = options

  const safeLimit = Math.floor(clampLimit(limit, DEFAULT_LIMIT))

  let cursorScore: number | undefined
  let cursorId: string | undefined
  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    cursorScore = cursor.score
    cursorId = cursor.id
  }

  const windowCutoffDate = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const postCutoffId = getMinUUIDv7ForDate(windowCutoffDate)

  // Set-based equivalents of view_community_metrics counts. That view's correlated
  // per-community subqueries cannot apply LIMIT until every public community is scored.
  //
  // Candidates are the top TRENDING_CANDIDATE_LIMIT communities by recent post activity;
  // members/follows/mutes are then aggregated only for those candidates, so cost is a function
  // of the cap instead of total community count. A community with no posts in the window never
  // becomes a candidate, however many members/follows/mutes it has — see the PR description for
  // that consequence.
  const query = sql`/* getTrendingCommunities */
    WITH candidate_reviewed_posts AS (
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
      JOIN posts access_post ON access_post.id = COALESCE(p.root_id, p.id)
      WHERE p.community_id IS NOT NULL
        AND p.id >= ${postCutoffId}
        AND `

  query.append(buildPublicPostEligibilityFilter('p', 'access_post'))

  query.append(sql`
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
        )::DOUBLE PRECISION AS trending_score,
        COALESCE(mc.member_count, 0) AS member_count,
        COALESCE(cand.post_count, 0) AS post_count,
        (
          COALESCE(pf.proxy_follow_count, 0)
          + COALESCE(pm.proxy_mute_count, 0)
        ) AS virtual_subscription_count
      FROM candidates cand
      INNER JOIN communities c ON c.id = cand.community_id
      LEFT JOIN member_counts mc ON mc.community_id = c.id
      LEFT JOIN proxy_follow_counts pf ON pf.community_id = c.id
      LEFT JOIN proxy_mute_counts pm ON pm.community_id = c.id
      WHERE c.deleted_at IS NULL
        AND c.visibility = 'public'
    )
    SELECT id, trending_score, member_count, post_count, virtual_subscription_count
    FROM scored
    WHERE trending_score > 0`)

  if (cursorScore !== undefined && cursorId !== undefined) {
    query.append(sql`
      AND (trending_score, id) < (${cursorScore}, ${cursorId})`)
  }

  query.append(sql`
    ORDER BY trending_score DESC, id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await dependencies.read(query)

  const hasNextPage = rows.length > safeLimit
  const communities = rows.slice(0, safeLimit) as TrendingCommunity[]

  return {
    communities,
    page_info: buildPageInfo(communities, {
      hasNextPage,
      getCursor: item => ({ score: item.trending_score, id: item.id }),
    }),
  }
}
