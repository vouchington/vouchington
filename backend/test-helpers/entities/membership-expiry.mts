import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMembershipByUserId, getUserActiveMembership } from '../../services/memberships/get.mts'
import { expireElapsedMemberships } from '../../services/memberships/grants/expire-elapsed.mts'

export async function updateTestMembershipExpiresAtRelativeToDatabaseNow(
  membershipId: string,
  offsetMilliseconds: number,
  query?: QueryExecutor,
): Promise<void> {
  if (!Number.isSafeInteger(offsetMilliseconds))
    throw new RangeError('Membership expiry offset must be a safe integer')

  if (query) {
    await updateMembershipExpiry(query, membershipId, offsetMilliseconds)
    return
  }

  await using transaction = await beginTransaction()
  await updateMembershipExpiry(transaction, membershipId, offsetMilliseconds)
  await transaction.commit()
}

async function updateMembershipExpiry(
  query: QueryExecutor,
  membershipId: string,
  offsetMilliseconds: number,
): Promise<void> {
  await query(sql`/* updateTestMembershipExpiresAtRelativeToDatabaseNow */
    WITH updated AS (
      UPDATE memberships
      SET effective_at = LEAST(
        effective_at,
        CURRENT_TIMESTAMP + (${offsetMilliseconds}::double precision * INTERVAL '1 millisecond') - INTERVAL '1 millisecond'
      ),
        expires_at = CURRENT_TIMESTAMP + (${offsetMilliseconds}::double precision * INTERVAL '1 millisecond')
      WHERE id = ${membershipId}
      RETURNING membership_source_id, effective_at, expires_at
    )
    UPDATE membership_source_states state
    SET effective_at = LEAST(state.effective_at, updated.effective_at), expires_at = updated.expires_at
    FROM updated
    WHERE state.membership_source_id = updated.membership_source_id
  `)
  await query(sql`/* updateTestMembershipExpiresAtRelativeToDatabaseNow: close backdated grant activation */
    UPDATE membership_grant_activation_periods activation
    SET ended_at = activation.started_at
    FROM memberships membership
    INNER JOIN membership_grants grant_row
      ON grant_row.membership_source_id = membership.membership_source_id
    WHERE membership.id = ${membershipId}
      AND activation.membership_grant_id = grant_row.id
      AND activation.ended_at IS NULL
      AND membership.expires_at < activation.started_at
  `)
}

/** Reads both entitlement consumers against the same native instant as the owned expiry update. */
export async function readTestMembershipAtExpiryOffset(
  membershipId: string,
  userId: string,
  offsetMilliseconds: number,
) {
  await using transaction = await beginTransaction()
  await updateTestMembershipExpiresAtRelativeToDatabaseNow(
    membershipId,
    offsetMilliseconds,
    transaction,
  )
  const options = { query: transaction }
  const [membership, activeMembership] = await Promise.all([
    getMembershipByUserId(userId, options),
    getUserActiveMembership(userId, options),
  ])
  return { membership, activeMembership }
}

/** Owns the real sweep transaction while keeping its explicit cutoff and returned outcome visible. */
export async function expireTestMembershipsThrough(userId: string, expiresThrough: Date) {
  await using transaction = await beginTransaction()
  const result = await expireElapsedMemberships(userId, transaction, {
    activateQueuedGrants: false,
    expiresThrough,
  })
  await transaction.commit()
  return result
}
