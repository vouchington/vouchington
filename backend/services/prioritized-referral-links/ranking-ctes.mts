import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'

/**
 * Ranking CTEs shared by the in-network and out-of-network reads. The caller defines
 * `active_links(id, user_id, referral_program_topic_id, url, label, activated_at)`; these CTEs
 * score only the users in it.
 */
export function rankingCtesSql(referralProgramId: string): SQLStatement {
  const query = sql`linked_topic_ids AS (
  SELECT id FROM topics
  WHERE referral_program_topic_id = ${referralProgramId}
    AND deleted_at IS NULL
    AND merged_into_topic_id IS NULL
  UNION
  SELECT CAST(${referralProgramId} AS uuid)
),
user_contributions AS (
  SELECT
    p.created_by_id AS user_id,
    BOOL_OR(p.post_type = 'data_point') AS has_data_point,
    BOOL_OR(p.post_type = 'review') AS has_review,
    MAX(p.votes_score_net) AS best_score
  -- no-mistakes-disable-next-line postgres-required-predicates: posts are selected by author with no time window; an author id does not bound post ids (seeded posts predate their seeded author, and author deletion reassigns created_by_id), so every id partition is read through idx_posts__created_by_id
  FROM posts p
  JOIN posts root_post ON root_post.id = COALESCE(p.root_post_id, p.id)
  WHERE p.deleted_at IS NULL
    AND p.post_type IN ('data_point', 'review')
    AND p.created_by_id IN (SELECT user_id FROM active_links)
    AND `
  query.append(buildPublicPostEligibilityFilter('p', 'root_post')).append(sql`
    AND (
      EXISTS (SELECT 1 FROM post_data_point_topics pdt
              WHERE pdt.post_id = p.id AND pdt.topic_id IN (SELECT id FROM linked_topic_ids))
      OR EXISTS (SELECT 1 FROM post_review_topic_ratings prt
                 WHERE prt.post_id = p.id AND prt.topic_id IN (SELECT id FROM linked_topic_ids))
    )
  GROUP BY p.created_by_id
),
user_reviews AS (
  SELECT DISTINCT ON (p.created_by_id)
    p.created_by_id AS user_id,
    p.id AS review_post_id,
    (SELECT ps.slug FROM post_slugs ps WHERE ps.post_id = p.id ORDER BY ps.id DESC LIMIT 1) AS review_post_slug,
    (
      SELECT ROUND(AVG(prt.rating)::numeric, 1)
      FROM post_review_topic_ratings prt
      WHERE prt.post_id = p.id
        AND prt.topic_id IN (SELECT id FROM linked_topic_ids)
    ) AS review_avg_rating
  -- no-mistakes-disable-next-line postgres-required-predicates: posts are selected by author with no time window; an author id does not bound post ids (seeded posts predate their seeded author, and author deletion reassigns created_by_id), so every id partition is read through idx_posts__created_by_id
  FROM posts p
  JOIN posts root_post ON root_post.id = COALESCE(p.root_post_id, p.id)
  WHERE p.deleted_at IS NULL
    AND p.post_type = 'review'
    AND p.root_post_id IS NULL
    AND p.broadcast = 'everyone'
    AND p.approved_at IS NOT NULL
    AND p.created_by_id IN (SELECT user_id FROM active_links)
    AND `)
  query.append(buildPublicPostEligibilityFilter('p', 'root_post')).append(sql`
    AND EXISTS (
      SELECT 1 FROM post_review_topic_ratings prt
      WHERE prt.post_id = p.id AND prt.topic_id IN (SELECT id FROM linked_topic_ids)
    )
  ORDER BY p.created_by_id, p.votes_score_net DESC NULLS LAST, p.id DESC
),
user_tiers AS (
  SELECT membership.user_id,
    CASE membership.plan
      WHEN 'pro' THEN 1
      WHEN 'plus' THEN 2
    END AS tier_rank
  FROM memberships selected
  JOIN view_current_paid_memberships membership ON membership.membership_id = selected.id
  WHERE selected.user_id IN (SELECT user_id FROM active_links)
    AND selected.projection_ended_at IS NULL
)`)
  return query
}

/** Ordering shared by both ranked reads, after `priority_group` where one exists. */
export const RANK_ORDER_SQL = 'contribution_rank, tier_rank, best_score DESC, id'

/** Select list over `active_links al` joined to the ranking CTEs; add a FROM-compatible tail. */
export const RANKED_COLUMNS_SQL = `
    al.id, al.user_id, al.referral_program_topic_id AS referral_program_id, al.url, al.label,
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
  LEFT JOIN user_reviews ur ON al.user_id = ur.user_id`
