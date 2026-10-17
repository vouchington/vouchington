import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

// Call after acquiring the community/user membership lock and inserting the member, within
// the same transaction. Verified email addresses can have several matching invitations.
export async function deletePendingInvitesForMember(
  communityId: string,
  userId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* deletePendingInvitesForMember */
    DELETE FROM community_invites
    WHERE community_id = ${communityId}
      AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
      AND (
        invited_user_id = ${userId}
        OR invited_email IN (
          SELECT email_address FROM user_email_addresses WHERE user_id = ${userId}
        )
      )
  `,
    options,
  )
}
