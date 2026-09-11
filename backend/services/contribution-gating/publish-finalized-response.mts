import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

type PublishFinalizedContributionResponseInput = Readonly<{
  reservationId: string
  leaseId: string
}>

export type FinalizedContributionResponsePublishResult<T> =
  | { kind: 'published'; response: T }
  | { kind: 'pending' }
  | { kind: 'lost' }

export async function publishFinalizedContributionResponse<T>(
  input: PublishFinalizedContributionResponseInput,
): Promise<FinalizedContributionResponsePublishResult<T>> {
  await using query = await beginTransaction()

  const owned = await query(sql`/* publishFinalizedContributionResponse.lockClaim */
      SELECT reservation_id FROM post_admission_claims
      WHERE reservation_id = ${input.reservationId} AND lease_id = ${input.leaseId} AND expires_at > NOW()
      FOR UPDATE`)
  if (owned.rowCount !== 1) {
    await query.commit()
    return { kind: 'lost' }
  }
  if (await contributionReplayFinalizationPending(query, input.reservationId)) {
    await query(sql`/* publishFinalizedContributionResponse.releasePending */
        DELETE FROM post_admission_claims
        WHERE reservation_id = ${input.reservationId} AND lease_id = ${input.leaseId}`)
    await query.commit()
    return { kind: 'pending' }
  }
  const response = await persistFinalizedContributionResponse<T>(query, input.reservationId)
  await query(sql`/* publishFinalizedContributionResponse.release */
      DELETE FROM post_admission_claims WHERE reservation_id = ${input.reservationId} AND lease_id = ${input.leaseId}`)
  await query.commit()
  return { kind: 'published', response }
}

async function contributionReplayFinalizationPending(
  query: TransactionQuery,
  reservationId: string,
): Promise<boolean> {
  const result = await query<{ pending: boolean }>(sql`/* contributionReplayFinalizationPending */
    SELECT EXISTS(
      SELECT 1 FROM post_category_finalizations f
      JOIN post_admission_reservations r ON r.committed_post_id = f.post_id
      WHERE r.id = ${reservationId}
    ) AS pending`)
  return result.rows[0]?.pending ?? false
}

async function persistFinalizedContributionResponse<T>(
  query: TransactionQuery,
  reservationId: string,
): Promise<T> {
  const result = await query<{ response: T }>(sql`/* persistFinalizedContributionResponse */
    UPDATE post_admission_reservations
    SET replay_metadata = replay_metadata || '{"finalization":"complete"}'::jsonb,
      updated_at = NOW()
    WHERE id = ${reservationId} AND state = 'committed'
    RETURNING response`)
  const response = result.rows[0]?.response
  if (response === undefined)
    throw new Error('Finalized contribution admission response was not returned')
  return response
}
