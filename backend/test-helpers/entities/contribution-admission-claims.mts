import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Forces a claimed lease to expire after this transaction opens, exercising DB-clock fences. */
export async function expireContributionAdmissionClaimDuringTransactionForTest(
  query: TransactionQuery,
  reservationId: string,
): Promise<void> {
  await query(sql`/* expireContributionAdmissionClaimDuringTransactionForTest.expire */
    UPDATE post_admission_claims
    SET expires_at = clock_timestamp() + INTERVAL '100 milliseconds'
    WHERE reservation_id = ${reservationId}`)
  await query(
    sql`/* expireContributionAdmissionClaimDuringTransactionForTest.wait */ SELECT pg_sleep(${0.25})`,
  )
}

/** Removes the transaction's reservation so admission finalization must roll back its mutation. */
export async function deleteContributionAdmissionReservationDuringMutationForTest(
  query: TransactionQuery,
  input: { actorId: string; idempotencyKey: string },
): Promise<void> {
  await query(sql`/* deleteContributionAdmissionReservationDuringMutationForTest */
    DELETE FROM post_admission_reservations
    WHERE actor_id = ${input.actorId} AND idempotency_key = ${input.idempotencyKey}`)
}

export async function getContributionAdmissionClaimExpiryForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<Date | null> {
  const result = await write<{
    expires_at: Date
  }>(sql`/* getContributionAdmissionClaimExpiryForTest */
    SELECT c.expires_at
    FROM post_admission_claims c
    JOIN post_admission_reservations r ON r.id = c.reservation_id
    WHERE r.actor_id = ${input.actorId} AND r.idempotency_key = ${input.idempotencyKey}`)
  return result.rows[0]?.expires_at ?? null
}
