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
