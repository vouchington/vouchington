import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * A withdrawn notice leaves nothing for the claimant to add, so receiving a withdrawal
 * revokes every live guest capability on the case in the same transaction.
 */
export async function revokeCopyrightGuestCapabilitiesForWithdrawal(
  transaction: OwnedTransaction,
  input: { noticeId: string; revokedAt: Date },
): Promise<void> {
  await transaction(sql`/* revokeCopyrightGuestCapabilitiesForWithdrawal */
    WITH revoked AS (
      UPDATE copyright_notice_guest_capabilities
      SET revoked_at = ${input.revokedAt}
      WHERE copyright_notice_id = ${input.noticeId}
        AND revoked_at IS NULL
        AND expires_at > ${input.revokedAt}
      RETURNING id, copyright_notice_id
    )
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_guest_capability_id
    )
    SELECT copyright_notice_id, 'guest_capability_revoked_by_withdrawal', id FROM revoked
  `)
}
