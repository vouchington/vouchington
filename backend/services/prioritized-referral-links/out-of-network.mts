import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { childVisibilitySql, prioritizedLinksCache } from '@services/user-referral-program-links'
import { appendLinkUserJoin, filterLinks, toLinksWithUsers, type LinkRow } from './link-rows.mts'
import { RANK_ORDER_SQL, RANKED_COLUMNS_SQL, rankingCtesSql } from './ranking-ctes.mts'
import { getOfficialAccountId } from './official-account.mts'
import type { ReferralLinksWithUsers } from './types.mts'
import { getPersonalizedLinkMaxLimit } from './work-limits.mts'

/** What every viewer shares for one program: official links plus the top ranked other links. */
export type OutOfNetworkLinks = {
  official: ReferralLinksWithUsers
  others: ReferralLinksWithUsers
}

const getCached = prioritizedLinksCache.cacheGetByAny(loadOutOfNetworkLinks)

export async function getOutOfNetworkLinks(referralProgramId: string): Promise<OutOfNetworkLinks> {
  const links = await getCached(referralProgramId)
  if (!links) throw new Error(`No out-of-network referral links for ${referralProgramId}`)
  return links
}

export async function loadOutOfNetworkLinks(referralProgramId: string): Promise<OutOfNetworkLinks> {
  const officialUserId = await getOfficialAccountId()
  // Ranked once per program and sized to the largest page a request may ask for.
  const personalizedLinkLimit = getPersonalizedLinkMaxLimit()
  const query = sql`/* getOutOfNetworkReferralLinks */
WITH official_links AS (
  -- Deduplicate by URL so each distinct official URL appears at most once,
  -- picking the most recently activated row when duplicates exist.
  SELECT DISTINCT ON (l.url_id)
    l.id, l.user_id, l.referral_program_topic_id, u.url, l.label, l.activated_at
  FROM user_referral_program_links l
  JOIN urls u ON u.id = l.url_id
  WHERE l.referral_program_topic_id = ${referralProgramId}
    AND l.user_id = ${officialUserId}::uuid
    AND l.activated_at IS NOT NULL
    AND l.deleted_at IS NULL
    AND l.deactivated_at IS NULL
  ORDER BY l.url_id, l.activated_at DESC, l.id
),
active_links AS (
  SELECT DISTINCT ON (al.user_id)
    al.id, al.user_id, al.referral_program_topic_id, u.url, al.label, al.activated_at
  FROM user_referral_program_links al
  JOIN urls u ON u.id = al.url_id
  WHERE al.referral_program_topic_id = ${referralProgramId}
    AND al.user_id IS DISTINCT FROM ${officialUserId}::uuid
    AND al.activated_at IS NOT NULL
    AND al.deleted_at IS NULL
    AND al.deactivated_at IS NULL
    AND `
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
  SELECT ${RANKED_COLUMNS_SQL}
),
top_ranked AS (
  SELECT * FROM ranked
  ORDER BY ${RANK_ORDER_SQL}
  LIMIT ${personalizedLinkLimit}
),
combined AS (
  SELECT id, user_id, referral_program_id, url, label,
    5 AS priority_group, contribution_rank, tier_rank, best_score,
    review_post_id, review_post_slug, review_avg_rating, is_official
  FROM top_ranked
  UNION ALL
  SELECT id, user_id, referral_program_topic_id, url, label,
    0, 0, 0, 0, NULL::uuid, NULL::text, NULL::numeric, TRUE
  FROM official_links
)`,
    )
  appendLinkUserJoin(query, 'combined')
  query.append(`
ORDER BY l.priority_group, l.contribution_rank, l.tier_rank, l.best_score DESC, l.id`)

  const { rows } = await read<LinkRow>(query)
  const all = toLinksWithUsers(rows)
  return {
    official: filterLinks(all, link => link.is_official),
    others: filterLinks(all, link => !link.is_official),
  }
}
