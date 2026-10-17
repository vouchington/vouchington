import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'

export function buildIdentityVerificationPaidMembershipGate(userId: string) {
  return sql`/* identityVerificationPaidMembershipGate */
    SELECT membership.id FROM memberships membership
    JOIN LATERAL (
      SELECT status, plan FROM view_memberships WHERE id = membership.id LIMIT 1
    ) projection ON true
    WHERE membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND projection.status IN ('active', 'past_due')
      AND projection.plan IN ('plus', 'pro')`
}

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
    const insert = sql`/* grantIdentityVerificationAttempt */
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
            AND entitlement.grant_entitlement_attempt_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM identity_verification_attempts AS child
              WHERE child.grant_entitlement_attempt_id = entitlement.id AND child.consumed_at IS NOT NULL
            )
        )
        AND NOT EXISTS (`
    insert.append(buildIdentityVerificationPaidMembershipGate(userId))
    insert.append(sql`)`)
    const { rowCount: insertedRows } = await query(insert)
    rowCount = insertedRows ?? 0
  }
  await query.commit()
  if (rowCount !== 1)
    throw createHttpError(
      409,
      'Support retries require a completed terminal Free identity verification attempt.',
    )
}
