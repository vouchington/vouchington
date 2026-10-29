import type { DataRetentionLimits } from './config.mts'
import {
  cleanupPaymentLedgerPage,
  type CleanupPage,
  type Family,
} from './cleanup-payment-ledger-page.mts'

const FAMILIES: readonly Family[] = ['stripe_event', 'membership_operation']

/** Each daily run scans at most batchSize * maxBatches rows of each ledger. */
export async function cleanupPaymentLedgers(
  limits: DataRetentionLimits,
  recordIds?: readonly string[],
): Promise<CleanupPage[]> {
  if (recordIds && recordIds.length > limits.batchSize)
    throw new RangeError('Scoped payment ledger cleanup must fit one page')
  if (recordIds?.length === 0)
    return FAMILIES.map(family => ({ family, scanned: 0, deleted: 0, hasMore: false }))
  const results: CleanupPage[] = []
  for (const family of FAMILIES) {
    let scanned = 0
    let deleted = 0
    let hasMore = false
    // oxlint-disable no-await-in-loop -- each committed page advances this family's cursor.
    for (let batch = 0; batch < (recordIds ? 1 : limits.maxBatches); batch++) {
      // no-mistakes-disable-next-line query-reached-per-item: fixed payment families each run at most maxBatches indexed pages of batchSize rows.
      const page = await cleanupPaymentLedgerPage(family, limits.batchSize, recordIds)
      scanned += page.scanned
      deleted += page.deleted
      hasMore = page.hasMore
      if (!hasMore) break
    }
    // oxlint-enable no-await-in-loop
    results.push({ family, scanned, deleted, hasMore })
  }
  return results
}
