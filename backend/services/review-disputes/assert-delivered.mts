import assert from 'http-assert'
import { getReviewDisputeByIdFromPrimary } from './get.mts'

export async function assertReviewDisputeDelivered(id: string): Promise<void> {
  const dispute = await getReviewDisputeByIdFromPrimary(id)
  assert(dispute, 404, 'Dispute not found')
  assert(dispute.sent_at, 422, 'Dispute must be delivered before resolution')
}
