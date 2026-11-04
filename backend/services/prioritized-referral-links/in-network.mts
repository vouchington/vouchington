import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { childVisibilitySql } from '@services/user-referral-program-links'
import { buildViewerPostDiscoveryEligibilityFilter } from '@modules/feed-query-builders'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { DEFAULT_PERSONAL_LINK_LIMIT, RECENT_VOTE_LIMIT } from './config.mts'
import { appendLinkUserJoin, toLinksWithUsers, type LinkRow } from './link-rows.mts'
import { RANK_ORDER_SQL, RANKED_COLUMNS_SQL, rankingCtesSql } from './ranking-ctes.mts'
import type { ReferralLinksWithUsers } from './types.mts'
import { getRecentVoteWindowDays } from './work-limits.mts'

const MILLISECONDS_PER_DAY = 86_400_000

export type InNetworkResult = {
  inNetwork: ReferralLinksWithUsers
  /** Users among the requested candidates that the viewer muted or blocked. */
  excludedUserIds: Set<string>
}

/**
 * One read for a signed-in viewer: up to five links from people in their network (mutual follow,
 * follow, referred them, rated their posts positively), plus which of `candidateUserIds` they
 * muted or blocked so the shared out-of-network list can be filtered per viewer.
 */
export async function getInNetworkLinks(
  viewerId: string,
  referralProgramId: string,
  officialUserId: string | null,
  candidateUserIds: string[],
): Promise<InNetworkResult> {
  const votedPostEligibility = buildViewerPostDiscoveryEligibilityFilter('p', 'voted_root_post', {
    currentUserId: viewerId,
    isAdministrator: false,
  })
  // Votes on posts older than the window do not count; the post id bound also prunes partitions.
  const minVotedPostId = getMinUUIDv7ForDate(
    new Date(Date.now() - getRecentVoteWindowDays() * MILLISECONDS_PER_DAY),
  )
  const query = sql`/* getInNetworkReferralLinks */
WITH recent_votes AS (
  -- Newest votes first; an older vote on the same post is superseded below.
  SELECT id, post_id, score
  FROM post_votes
  WHERE user_id = ${viewerId} AND post_id >= ${minVotedPostId}
  ORDER BY id DESC
  LIMIT ${RECENT_VOTE_LIMIT}
),
rated_positively AS (
  SELECT DISTINCT p.created_by_id AS user_id
  FROM (SELECT DISTINCT ON (post_id) post_id, score FROM recent_votes ORDER BY post_id, id DESC) pv
  JOIN posts p ON pv.post_id = p.id
  JOIN posts voted_root_post ON voted_root_post.id = COALESCE(p.root_post_id, p.id)
  WHERE pv.score > 0
    AND `
    .append(votedPostEligibility)
    .append(
      sql`
),
network AS (
  SELECT f.object_id AS user_id, 2 AS priority_group
  FROM relation__user__follow__user f
  WHERE f.subject_id = ${viewerId} AND f.deleted_at IS NULL
  UNION ALL
  SELECT sra.referrer_user_id, 3
  FROM session_referral_attributions sra
  WHERE sra.user_id = ${viewerId} AND sra.referrer_user_id IS NOT NULL
  UNION ALL
  SELECT user_id, 4 FROM rated_positively
),
best_group AS (
  SELECT user_id, MIN(priority_group) AS priority_group FROM network GROUP BY user_id
),
active_links AS (
  SELECT DISTINCT ON (al.user_id)
    al.id, al.user_id, al.referral_program_topic_id, u.url, al.label, al.activated_at,
    -- Group 2 here means the viewer follows them; mutual follow is checked only for links that
    -- survive the program join, not for every followee.
    CASE WHEN bg.priority_group = 2 AND EXISTS (
      SELECT 1 FROM relation__user__follow__user back
      WHERE back.subject_id = al.user_id AND back.object_id = ${viewerId}
        AND back.deleted_at IS NULL
    ) THEN 1 ELSE bg.priority_group END AS priority_group
  FROM best_group bg
  JOIN user_referral_program_links al ON al.user_id = bg.user_id
  JOIN urls u ON u.id = al.url_id
  WHERE al.referral_program_topic_id = ${referralProgramId}
    AND al.user_id <> ${viewerId}
    AND al.user_id IS DISTINCT FROM ${officialUserId}::uuid
    AND al.activated_at IS NOT NULL
    AND al.deleted_at IS NULL
    AND al.deactivated_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM relation__user__mute__user m
      WHERE m.subject_id = ${viewerId} AND m.object_id = al.user_id AND m.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM relation__user__block__user b
      WHERE b.subject_id = ${viewerId} AND b.object_id = al.user_id AND b.deleted_at IS NULL
    )
    AND `,
    )
    .append(childVisibilitySql('al.parent_link_id', 'al.user_id'))
    .append(
      `
  ORDER BY al.user_id, al.activated_at DESC, al.id
),
`,
    )
    .append(rankingCtesSql(referralProgramId))
    .append(
      `,
ranked AS (
  SELECT al.priority_group, ${RANKED_COLUMNS_SQL}
),
top_ranked AS (
  SELECT * FROM ranked
  ORDER BY priority_group, ${RANK_ORDER_SQL}
  LIMIT ${DEFAULT_PERSONAL_LINK_LIMIT}
),
links AS (
  SELECT id, user_id, referral_program_id, url, label, priority_group, contribution_rank,
    tier_rank, best_score, review_post_id, review_post_slug, review_avg_rating, is_official
  FROM top_ranked
),
linked AS (`,
    )
  appendLinkUserJoin(query, 'links')
  query.append(sql`
),
excluded AS (
  SELECT COALESCE(array_agg(candidate.user_id), '{}') AS user_ids
  FROM unnest(${candidateUserIds}::uuid[]) AS candidate(user_id)
  WHERE EXISTS (
      SELECT 1 FROM relation__user__mute__user m
      WHERE m.subject_id = ${viewerId} AND m.object_id = candidate.user_id AND m.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM relation__user__block__user b
      WHERE b.subject_id = ${viewerId} AND b.object_id = candidate.user_id AND b.deleted_at IS NULL
    )
)
-- One row always returns so the excluded users arrive even when the viewer has no network links.
SELECT excluded.user_ids AS excluded_user_ids, linked.*
FROM excluded
LEFT JOIN linked ON TRUE
ORDER BY linked.priority_group, linked.contribution_rank, linked.tier_rank,
  linked.best_score DESC, linked.id`)
  const { rows } = await read<InNetworkRow>(query)
  const excludedUserIds = new Set<string>(rows[0]?.excluded_user_ids ?? [])
  const linkRows = rows
    .filter(row => row.id !== null)
    .map(({ excluded_user_ids: _, ...link }) => link)
  return { inNetwork: toLinksWithUsers(linkRows), excludedUserIds }
}

type InNetworkRow = LinkRow & { excluded_user_ids: string[] }
