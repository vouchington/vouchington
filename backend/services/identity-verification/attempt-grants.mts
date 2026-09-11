import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'

export async function grantIdentityVerificationAttempt(
  userId: string,
  grantedById: string,
  grantNote: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows: targetRows } = await query(sql`/* grantIdentityVerificationAttempt:lock-target */
      SELECT id FROM users
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status IN ('unverified', 'failed')
      ORDER BY id
      FOR UPDATE
    `)
  let rowCount = 0
  if (targetRows.length === 1) {
    const { rowCount: insertedRows } = await query(sql`/* grantIdentityVerificationAttempt */
      INSERT INTO identity_verification_attempts (user_id, source, granted_by_id, grant_note)
      SELECT ${userId}, 'support_grant', ${grantedById}, ${grantNote}
      WHERE EXISTS (
          SELECT 1 FROM identity_verification_attempts AS attempt
          WHERE attempt.user_id = ${userId} AND attempt.source = 'self_paid'
            AND attempt.consumed_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM identity_verification_attempts AS entitlement
          WHERE entitlement.user_id = ${userId} AND entitlement.source = 'support_grant'
            AND entitlement.grant_entitlement_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM identity_verification_attempts AS child
              WHERE child.grant_entitlement_id = entitlement.id AND child.consumed_at IS NOT NULL
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM view_memberships
          WHERE user_id = ${userId} AND status IN ('active', 'past_due') AND plan IN ('plus', 'pro')
        )
    `)
    rowCount = insertedRows ?? 0
  }
  await query.commit()
  if (rowCount !== 1)
    throw createHttpError(
      409,
      'Support retries require a completed terminal Free identity verification attempt.',
    )
}
