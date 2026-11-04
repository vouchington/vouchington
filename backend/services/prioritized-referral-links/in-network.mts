import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildViewerPostDiscoveryEligibilityFilter } from '@modules/feed-query-builders'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { RECENT_VOTE_LIMIT } from './config.mts'
import { appendLinkUserJoin, toLinksWithUsers, type LinkRow } from './link-rows.mts'
import { networkGroupsSql } from './network-groups.mts'
import { RANK_ORDER_SQL, RANKED_COLUMNS_SQL, rankingCtesSql } from './ranking-ctes.mts'
import type { ReferralLinksWithUsers } from './types.mts'
import { getPersonalizedLinkLimit, getVotedPostMaxAgeDays } from './work-limits.mts'

const MILLISECONDS_PER_DAY = 86_400_000

export type InNetworkResult = {
  inNetwork: ReferralLinksWithUsers
  /** Users among the requested candidates that the viewer muted or blocked. */
  excludedUserIds: Set<string>
}

/**
 * One read for a signed-in viewer: up to five links from people in their network (mutual follow,
 * follow, referred them, rated their posts positively), plus which of `candidateUserIds` they
 * muted or blocked so the shared out-of-network list can be filtered per viewer. Each group keeps
 * its newest links after its link filters, and the same limit caps each group and the total.
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
    new Date(Date.now() - getVotedPostMaxAgeDays() * MILLISECONDS_PER_DAY),
  )
  const personalizedLinkLimit = getPersonalizedLinkLimit()
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
    .append(sql`
),
`)
    .append(
      networkGroupsSql({
        viewerId,
        referralProgramId,
        officialUserId,
        limit: personalizedLinkLimit,
      }),
    )
    .append(`,
`)
    .append(rankingCtesSql(referralProgramId))
    .append(
      `,
ranked AS (
  SELECT al.priority_group, ${RANKED_COLUMNS_SQL}
),
top_ranked AS (
  SELECT * FROM ranked
  ORDER BY priority_group, ${RANK_ORDER_SQL}
  LIMIT ${personalizedLinkLimit}
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
