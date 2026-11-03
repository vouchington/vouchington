import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import { childVisibilitySql } from '@services/user-referral-program-links'
import type { PageInfo } from '@voucha/types/pagination'
import { DEFAULT_ALL_LINKS_PAGE_LIMIT, MAX_ALL_LINKS_PAGE_LIMIT } from './config.mts'
import { getOfficialAccountId } from './official-account.mts'
import { toLinksWithUsers, type LinkRow } from './link-rows.mts'
import type { ReferralLinksWithUsers } from './types.mts'

export type AllReferralLinksPage = ReferralLinksWithUsers & { page_info: PageInfo }

/**
 * Every visible link in the program, newest first, one keyset page at a time. Link ids are
 * UUIDv7, so id order is creation order. The viewer's own link is included; muted and blocked
 * users are not.
 */
export async function getAllReferralLinksPage(
  viewerId: string,
  referralProgramId: string,
  options?: { limit?: number; after?: string },
): Promise<AllReferralLinksPage> {
  const limit = Math.min(
    Math.max(1, Math.floor(options?.limit ?? DEFAULT_ALL_LINKS_PAGE_LIMIT)),
    MAX_ALL_LINKS_PAGE_LIMIT,
  )
  const cursorId = options?.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format').id
    : null
  const officialUserId = await getOfficialAccountId()
  const query = sql`/* getAllReferralLinksPage */
SELECT al.id, al.user_id, al.referral_program_topic_id AS referral_program_id, u.url, al.label,
  CASE WHEN al.user_id = ${officialUserId}::uuid THEN 0 ELSE 5 END AS priority_group,
  0 AS contribution_rank, 0 AS tier_rank, 0 AS best_score,
  NULL::uuid AS review_post_id, NULL::text AS review_post_slug, NULL::numeric AS review_avg_rating,
  al.user_id = ${officialUserId}::uuid AS is_official,
  vup.username, vup.account_type, vup.display_account->>'name' AS user_display_name
FROM user_referral_program_links al
JOIN urls u ON u.id = al.url_id
LEFT JOIN view_users_public vup ON vup.id = al.user_id
WHERE al.referral_program_topic_id = ${referralProgramId}
  AND al.activated_at IS NOT NULL
  AND al.deleted_at IS NULL
  AND al.deactivated_at IS NULL
  AND (${cursorId}::uuid IS NULL OR al.id < ${cursorId}::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM relation__user__mute__user m
    WHERE m.subject_id = ${viewerId} AND m.object_id = al.user_id AND m.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM relation__user__block__user b
    WHERE b.subject_id = ${viewerId} AND b.object_id = al.user_id AND b.deleted_at IS NULL
  )
  AND `
    .append(childVisibilitySql('al.parent_link_id', 'al.user_id'))
    .append(
      sql`
ORDER BY al.id DESC
LIMIT ${limit + 1}`,
    )
  const { rows } = await read<LinkRow>(query)
  const hasNextPage = rows.length > limit
  const page = toLinksWithUsers(rows.slice(0, limit))
  const lastId = page.links.at(-1)?.id
  return {
    ...page,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && lastId ? encodeCursor({ id: lastId }) : null,
      start_cursor: page.links[0] ? encodeCursor({ id: page.links[0].id }) : null,
    },
  }
}
