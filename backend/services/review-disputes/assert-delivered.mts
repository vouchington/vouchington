import assert from 'http-assert'
import type { QueryOptions } from '@data-stores/psql'
import { getReviewDisputeByIdFromPrimary } from './get.mts'

export async function assertReviewDisputeDelivered(
  id: string,
  options: QueryOptions = {},
): Promise<void> {
  const dispute = await getReviewDisputeByIdFromPrimary(id, options)
  assert(dispute, 404, 'Dispute not found')
  assert(dispute.sent_at, 422, 'Dispute must be delivered before resolution')
}

/**
 * Explains a resolution update that matched no row. The update's own `sent_at IS NOT NULL AND
 * resolved_at IS NULL` predicates guard the success path, so only a miss reads, and it reports
 * the same 404, 422, then 404 precedence a pre-read would.
 */
export async function rejectUnresolvableDispute(
  id: string,
  options: QueryOptions = {},
): Promise<never> {
  await assertReviewDisputeDelivered(id, options)
  assert(false, 404, 'Dispute not found or already resolved')
}
