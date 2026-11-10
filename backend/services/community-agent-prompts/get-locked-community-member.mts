import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { CommunityMemberRole } from '@services/communities/types'
import sql from 'sql-template-strings'

type LockedActiveCommunityMember = { role: CommunityMemberRole }

/** Reads the caller's current community membership. The row is not locked. */
export async function getLockedActiveCommunityMember(
  communityId: string,
  userId: string,
  options: QueryOptions,
): Promise<LockedActiveCommunityMember | null> {
  const { rows } = await write<LockedActiveCommunityMember>(
    sql`/* getLockedActiveCommunityMember */
      SELECT role
      FROM community_members
      WHERE community_id = ${communityId}
        AND user_id = ${userId}
        AND removed_at IS NULL

    `,
    options,
  )
  return rows[0] ?? null
}
