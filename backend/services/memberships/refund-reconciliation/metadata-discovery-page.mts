import type {
  MetadataDiscoverableRefund,
  RefundMetadataPage,
  RefundMetadataScanState,
} from './metadata-discovery.mts'
import type { RefundReconciliationAttempt } from './types.mts'

export function scanStateFromPage(
  page: RefundMetadataPage,
): Omit<RefundMetadataScanState, 'completedAt'> & { completedAt: null } {
  return {
    completedAt: null,
    nextProviderRefundId: page.hasMore ? page.nextCursor : null,
    stableHeadProviderRefundId: page.refunds[0]?.id ?? null,
  }
}

export function assertPageCursor(page: RefundMetadataPage, startingAfter?: string): void {
  if (page.hasMore && !page.nextCursor)
    throw new Error('Stripe refund metadata discovery page has_more requires a next cursor')
  if (page.hasMore && page.nextCursor === startingAfter)
    throw new Error('Stripe refund metadata discovery page repeated its cursor')
}

export function findOperationRefund(
  refunds: readonly MetadataDiscoverableRefund[],
  attempt: Pick<RefundReconciliationAttempt, 'id' | 'membershipOperationId'>,
): MetadataDiscoverableRefund | null {
  return (
    refunds.find(
      refund =>
        refund.metadata?.membership_refund_operation_id === attempt.membershipOperationId &&
        refund.metadata.membership_refund_attempt_id === attempt.id,
    ) ?? null
  )
}
