import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const NO_MODERATOR_CURSOR = '00000000-0000-0000-0000-000000000000'

export type PurgeSuccessorScan = {
  communityId: string
  scanned: number
  lastId: string | null
  memberId: string | null
  userId: string | null
}

/**
 * One statement scans one bounded moderator page per community and reports its oldest eligible
 * successor, so a page of communities costs the same number of statements as a single community.
 */
export async function selectUserPurgeSuccessors(
  query: TransactionQuery,
  ownerUserId: string,
  communityIds: readonly string[],
  pageSize: number,
  afterModeratorId: string,
): Promise<Map<string, PurgeSuccessorScan>> {
  const { rows } = await query<{
    community_id: string
    scanned: number
    last_id: string | null
    member_id: string | null
    user_id: string | null
  }>(sql`/* cleanupUserOwnedCommunities:successors */
    SELECT input.community_id, page.scanned, page.last_id, page.member_id, page.user_id
    FROM unnest(${[...communityIds]}::uuid[]) AS input(community_id)
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS scanned,
        (array_agg(moderator.id ORDER BY moderator.id DESC))[1] AS last_id,
        (array_agg(moderator.id ORDER BY moderator.id) FILTER (WHERE moderator.eligible))[1] AS member_id,
        (array_agg(moderator.user_id ORDER BY moderator.id) FILTER (WHERE moderator.eligible))[1] AS user_id
      FROM (
        SELECT member.id, member.user_id,
          (candidate.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = candidate.id AND lifted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM user_deletion_requests WHERE user_id = candidate.id AND completed_at IS NULL)
          ) AS eligible
        FROM community_members member JOIN users candidate ON candidate.id = member.user_id
        WHERE member.community_id = input.community_id AND member.role = 'moderator'
          AND member.removed_at IS NULL AND member.id > ${afterModeratorId}::uuid
          AND member.user_id <> ${ownerUserId}
        ORDER BY member.id LIMIT ${pageSize}
      ) moderator
    ) page
    ORDER BY input.community_id`)
  return new Map(
    rows.map(row => [
      row.community_id,
      {
        communityId: row.community_id,
        scanned: row.scanned,
        lastId: row.last_id,
        memberId: row.member_id,
        userId: row.user_id,
      },
    ]),
  )
}
