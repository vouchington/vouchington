import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Expires a claimed lease during this transaction, exercising DB-clock fences without waiting. */
export async function expireContributionAdmissionClaimDuringTransactionForTest(
  query: TransactionQuery,
  reservationId: string,
): Promise<void> {
  const result = await query<{
    expired_after_transaction_start: boolean
  }>(sql`/* expireContributionAdmissionClaimDuringTransactionForTest */
    UPDATE post_admission_claims
    SET leased_at = statement_timestamp() - INTERVAL '1 millisecond',
      lease_expires_at = statement_timestamp()
    WHERE reservation_id = ${reservationId}
    RETURNING lease_expires_at > transaction_timestamp() AS expired_after_transaction_start`)
  if (!result.rows[0]?.expired_after_transaction_start) {
    throw new Error('Test lease expiry must follow the transaction start')
  }
}

/** Removes the transaction's reservation so admission finalization must roll back its mutation. */
export async function deleteContributionAdmissionReservationDuringMutationForTest(
  query: TransactionQuery,
  input: { actorId: string; idempotencyKey: string },
): Promise<void> {
  await query(sql`/* deleteContributionAdmissionReservationDuringMutationForTest */
    DELETE FROM post_admission_reservations
    WHERE actor_user_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}`)
}

export async function getContributionAdmissionClaimExpiryForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<Date | null> {
  const result = await write<{
    lease_expires_at: Date
  }>(sql`/* getContributionAdmissionClaimExpiryForTest */
    SELECT c.lease_expires_at
    FROM post_admission_claims c
    JOIN post_admission_reservations r ON r.id = c.reservation_id
    WHERE r.actor_user_id = ${input.actorId} AND r.idempotency_key = ${input.idempotencyKey}`)
  return result.rows[0]?.lease_expires_at ?? null
}
