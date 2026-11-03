import { DATA_RETENTION_MAX_VALUES, type DataRetentionLimits } from './config.mts'
import { cleanupStripeEventPage } from './cleanup-payment-stripe-events.mts'
import { cleanupMembershipOperationPage } from './cleanup-payment-membership-operations.mts'

export type PaymentLedgerFamily = 'stripe_event' | 'membership_operation'
export type PaymentLedgerCleanupPage = {
  family: PaymentLedgerFamily
  scanned: number
  deleted: number
  hasMore: boolean
}

/** Oldest expired UUIDs are reconsidered on each daily pass; no permanent replay row survives. */
export async function cleanupPaymentLedgers(
  limits: DataRetentionLimits,
  recordIds?: readonly string[],
): Promise<PaymentLedgerCleanupPage[]> {
  if (
    !Number.isSafeInteger(limits.batchSize) ||
    limits.batchSize < 1 ||
    limits.batchSize > DATA_RETENTION_MAX_VALUES.batch_size ||
    !Number.isSafeInteger(limits.maxBatches) ||
    limits.maxBatches < 1 ||
    limits.maxBatches > DATA_RETENTION_MAX_VALUES.max_batches_per_run
  )
    throw new RangeError('Payment ledger retention requires positive limits')
  if (recordIds && recordIds.length > limits.batchSize)
    throw new RangeError('Scoped payment ledger cleanup must fit one page')
  // A UTC fiscal year becomes erasable after the next seven whole years have ended.
  const fiscalCutoff = new Date(Date.UTC(new Date().getUTCFullYear() - 7, 0, 1))
  const results: PaymentLedgerCleanupPage[] = []
  for (const family of ['stripe_event', 'membership_operation'] as const) {
    const result: PaymentLedgerCleanupPage = { family, scanned: 0, deleted: 0, hasMore: false }
    for (let batch = 0; batch < (recordIds ? 1 : limits.maxBatches); batch++) {
      // oxlint-disable-next-line no-await-in-loop -- each bounded transaction commits before the next oldest-id page.
      const page = await cleanupPaymentLedgerPage(family, limits.batchSize, fiscalCutoff, recordIds) // no-mistakes-disable-line query-reached-per-item: two fixed families each commit at most maxBatches transactions; a Stripe page locks at most batchSize + 1 event IDs, a membership page reads batchSize + 1 operation rows and locks one, and each deletes at most batchSize physical rows.
      result.scanned += page.scanned
      result.deleted += page.deleted
      result.hasMore = page.hasMore
      if (!page.hasMore) break
    }
    results.push(result)
  }
  return results
}

function cleanupPaymentLedgerPage(
  family: PaymentLedgerFamily,
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  return family === 'stripe_event'
    ? cleanupStripeEventPage(pageSize, fiscalCutoff, recordIds)
    : cleanupMembershipOperationPage(pageSize, fiscalCutoff, recordIds)
}
