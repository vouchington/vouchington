import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PrioritizedReferralLink, ReferralLinkUser } from './types.mts'

export const MAX_REQUESTED_LINK_LIMIT = 100

export function appendPrioritizedRankingColumns(query: SQLStatement): void {
  query.append(sql`
    CASE
      WHEN COALESCE(uc.has_data_point, false) AND COALESCE(uc.has_review, false) THEN 1
      WHEN COALESCE(uc.has_data_point, false) OR COALESCE(uc.has_review, false) THEN 2
      ELSE 3
    END AS contribution_rank,
    COALESCE(ut.tier_rank, 3) AS tier_rank,
    COALESCE(uc.best_score, 0) AS best_score,
    ur.review_post_id,
    ur.review_post_slug,
    ur.review_avg_rating,
    FALSE AS is_official
  FROM active_links al
  LEFT JOIN user_contributions uc ON al.user_id = uc.user_id
  LEFT JOIN user_tiers ut ON al.user_id = ut.user_id
  LEFT JOIN user_reviews ur ON al.user_id = ur.user_id
  ORDER BY al.user_id, al.activated_at DESC, al.id
`)
}

export function appendPrioritizedLinksQuery(
  query: SQLStatement,
  options: { all: boolean; limit: number },
) {
  query.append(sql`
)`)

  if (options.all) {
    query.append(sql`
SELECT * FROM (
  SELECT * FROM ranked
  UNION ALL
  SELECT
    ol.id, ol.user_id, ol.referral_program_id, ol.url, ol.label,
    0 AS priority_group,
    0 AS contribution_rank,
    0 AS tier_rank,
    0 AS best_score,
    NULL::uuid AS review_post_id,
    NULL::text AS review_post_slug,
    NULL::numeric AS review_avg_rating,
    TRUE AS is_official
  FROM official_links ol
) combined
ORDER BY priority_group, contribution_rank, tier_rank, best_score DESC, id
`)
    return
  }

  query.append(sql`,
friend_links AS (
  SELECT * FROM ranked
  WHERE priority_group <= 2
  ORDER BY priority_group, contribution_rank, tier_rank, best_score DESC, id
),
limited_personal_links AS (
  SELECT * FROM friend_links
  UNION ALL
  (
    SELECT * FROM ranked
    WHERE priority_group > 2
    ORDER BY priority_group, contribution_rank, tier_rank, best_score DESC, id
    LIMIT GREATEST(${options.limit} - (SELECT COUNT(*) FROM friend_links), 0)
  )
)
SELECT * FROM (
  SELECT * FROM limited_personal_links
  UNION ALL
  SELECT
    ol.id, ol.user_id, ol.referral_program_id, ol.url, ol.label,
    0 AS priority_group,
    0 AS contribution_rank,
    0 AS tier_rank,
    0 AS best_score,
    NULL::uuid AS review_post_id,
    NULL::text AS review_post_slug,
    NULL::numeric AS review_avg_rating,
    TRUE AS is_official
  FROM official_links ol
) combined
ORDER BY priority_group, contribution_rank, tier_rank, best_score DESC, id
`)
}

export async function collectUsers(
  rows: PrioritizedReferralLink[],
  users: Record<string, ReferralLinkUser>,
) {
  if (rows.length === 0) return
  const userIds = rows.flatMap(r => (r.user_id && !users[r.user_id] ? [r.user_id] : []))
  if (userIds.length === 0) return
  const { rows: userRows } = await read(sql`/* collectUsers */
    SELECT id, username, display_account->>'name' AS display_name
    FROM view_users_public
    WHERE id = ANY(${userIds})
  `)
  for (const u of userRows) {
    users[u.id] = { id: u.id, username: u.username, display_name: u.display_name ?? null }
  }
}

export async function buildPrioritizedReferralLinksResult(
  rows: PrioritizedReferralLink[],
): Promise<{ links: PrioritizedReferralLink[]; users: Record<string, ReferralLinkUser> }> {
  const users: Record<string, ReferralLinkUser> = {}
  await collectUsers(rows, users)
  return { links: rows, users }
}
