import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { childVisibilitySql } from '@services/user-referral-program-links'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { PrioritizedReferralLink, ReferralLinkUser } from './types.mts'
import {
  appendPrioritizedLinksQuery,
  appendPrioritizedRankingColumns,
  buildPrioritizedReferralLinksResult,
  MAX_REQUESTED_LINK_LIMIT,
} from './query-helpers.mts'

const DEFAULT_PERSONAL_LINK_LIMIT = 5

export async function getPrioritizedReferralLinks(
  currentUserId: string | null,
  referralProgramId: string,
  options?: { limit?: number; all?: boolean },
): Promise<{ links: PrioritizedReferralLink[]; users: Record<string, ReferralLinkUser> }> {
  const limit = Math.min(
    Math.max(1, Math.floor(options?.limit ?? DEFAULT_PERSONAL_LINK_LIMIT)),
    MAX_REQUESTED_LINK_LIMIT,
  )
  const all = options?.all ?? false

  const query = sql`/* getPrioritizedReferralLinks */
WITH
excluded_users AS (
  SELECT object_id AS user_id FROM relation__user__mute__user
  WHERE subject_id = ${currentUserId}::uuid AND deleted_at IS NULL
  UNION ALL
  SELECT object_id FROM relation__user__block__user
  WHERE subject_id = ${currentUserId}::uuid AND deleted_at IS NULL
),
official_links AS (
  -- Deduplicate by URL so each distinct official URL appears at most once,
  -- picking the most recently activated row when duplicates exist.
  SELECT DISTINCT ON (l.url_id)
    l.id, l.user_id, l.referral_program_id, u.url, l.label, l.activated_at
  FROM user_referral_program_links l
  JOIN urls u ON u.id = l.url_id
  JOIN users usr ON usr.id = l.user_id
  WHERE l.referral_program_id = ${referralProgramId}
    AND l.activated_at IS NOT NULL
    AND l.deleted_at IS NULL
    AND l.deactivated_at IS NULL
    AND usr.username = 'voucha'
  ORDER BY l.url_id, l.activated_at DESC, l.id
),
active_links AS (
  SELECT al.id, al.user_id, al.referral_program_id, u.url, al.label, al.activated_at
  FROM user_referral_program_links al
  JOIN urls u ON u.id = al.url_id
  WHERE al.referral_program_id = ${referralProgramId}
    AND al.activated_at IS NOT NULL
    AND al.deleted_at IS NULL
    AND al.deactivated_at IS NULL
    AND al.user_id NOT IN (SELECT user_id FROM official_links WHERE user_id IS NOT NULL)`

  if (!all) {
    query.append(sql`
    AND (${currentUserId}::uuid IS NULL OR al.user_id != ${currentUserId}::uuid)`)
  }

  query.append(sql`
    AND al.user_id NOT IN (SELECT user_id FROM excluded_users)
    AND `)
  query.append(childVisibilitySql('al.parent_link_id', 'al.user_id'))
  query.append(sql`
),
linked_topic_ids AS (
  SELECT id FROM topics
  WHERE referral_program_id = ${referralProgramId}
    AND deleted_at IS NULL
  UNION
  SELECT CAST(${referralProgramId} AS uuid)
),
user_contributions AS (
  SELECT
    p.created_by_id AS user_id,
    BOOL_OR(p.post_type = 'data_point') AS has_data_point,
    BOOL_OR(p.post_type = 'review') AS has_review,
    MAX(p.votes_score_net) AS best_score
  FROM posts p
  JOIN posts root_post ON root_post.id = COALESCE(p.root_id, p.id)
  WHERE p.deleted_at IS NULL
    AND p.post_type IN ('data_point', 'review')
    AND p.created_by_id IN (SELECT user_id FROM active_links)
    AND `)
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
    (SELECT ps.slug FROM post_slugs ps WHERE ps.post_id = p.id ORDER BY ps.created_at DESC LIMIT 1) AS review_post_slug,
    (
      SELECT ROUND(AVG(prt.rating)::numeric, 1)
      FROM post_review_topic_ratings prt
      WHERE prt.post_id = p.id
        AND prt.topic_id IN (SELECT id FROM linked_topic_ids)
    ) AS review_avg_rating
  FROM posts p
  JOIN posts root_post ON root_post.id = COALESCE(p.root_id, p.id)
  WHERE p.deleted_at IS NULL
    AND p.post_type = 'review'
    AND p.root_id IS NULL
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
  FROM view_current_paid_memberships membership
  WHERE membership.user_id IN (SELECT user_id FROM active_links)
),
ranked AS (
  SELECT DISTINCT ON (al.user_id)
    al.id, al.user_id, al.referral_program_id, al.url, al.label,`)

  if (all) {
    query.append(sql`
    5 AS priority_group,`)
  } else {
    const votedPostEligibility = buildViewerPostDiscoveryEligibilityFilter('p', 'voted_root_post', {
      currentUserId: currentUserId!,
      isAdministrator: false,
    })
    query.append(sql`
    CASE
      WHEN ${currentUserId}::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM relation__user__follow__user f1
        WHERE f1.subject_id = ${currentUserId}::uuid AND f1.object_id = al.user_id AND f1.deleted_at IS NULL
      ) AND EXISTS (
        SELECT 1 FROM relation__user__follow__user f2
        WHERE f2.subject_id = al.user_id AND f2.object_id = ${currentUserId}::uuid AND f2.deleted_at IS NULL
      ) THEN 1
      WHEN ${currentUserId}::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM relation__user__follow__user f
        WHERE f.subject_id = ${currentUserId}::uuid AND f.object_id = al.user_id AND f.deleted_at IS NULL
      ) THEN 2
      WHEN ${currentUserId}::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM session_referral_attributions sra
        WHERE sra.user_id = ${currentUserId}::uuid AND sra.referrer_id = al.user_id
      ) THEN 3
      WHEN ${currentUserId}::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM (
          SELECT DISTINCT ON (post_id) post_id, score
          FROM post_votes
          WHERE user_id = ${currentUserId}::uuid
          ORDER BY post_id, id DESC
        ) pv
        JOIN posts p ON pv.post_id = p.id
        JOIN posts voted_root_post ON voted_root_post.id = COALESCE(p.root_id, p.id)
        WHERE p.created_by_id = al.user_id AND pv.score > 0
          AND `)
    query.append(votedPostEligibility).append(sql`
      ) THEN 4
      ELSE 5
    END AS priority_group,`)
  }

  appendPrioritizedRankingColumns(query)
  appendPrioritizedLinksQuery(query, { all, limit })

  const { rows } = await read(query)
  return buildPrioritizedReferralLinksResult(rows as PrioritizedReferralLink[])
}
