import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import {
  explainActivityPubInboxCleanupForTest,
  insertActivityPubInboxCapacityDeliveriesForTest,
  resetActivityPubInboxDeliveryStorageForTest,
  setActivityPubInboxStorageCountersForTest,
} from '@voucha/test-helpers'
import {
  buildExpireActivityPubInboxDeliveriesQuery,
  expireActivityPubInboxDeliveries,
  getActivityPubInboxStorageSnapshot,
} from '@services/ap-inbox-activities'

describe('ActivityPub inbox capacity system boundary', () => {
  beforeEach(resetActivityPubInboxDeliveryStorageForTest)
  afterEach(resetActivityPubInboxDeliveryStorageForTest)

  it('admits exactly the remaining row capacity under concurrent writes', async () => {
    await setActivityPubInboxStorageCountersForTest(
      ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRows - 1,
      0,
    )

    const outcomes = await Promise.allSettled([
      insertActivityPubInboxCapacityDeliveriesForTest(1, 1),
      insertActivityPubInboxCapacityDeliveriesForTest(1, 1),
    ])

    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = outcomes.find(result => result.status === 'rejected')
    expect(rejection).toMatchObject({
      reason: { code: '23514', constraint: 'ap_inbox_deliveries_unverified_capacity' },
    })
  })

  it('admits exactly the remaining raw-body byte capacity under concurrent writes', async () => {
    await setActivityPubInboxStorageCountersForTest(
      0,
      ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRawBodyBytes - 6,
    )

    const outcomes = await Promise.allSettled([
      insertActivityPubInboxCapacityDeliveriesForTest(1, 4),
      insertActivityPubInboxCapacityDeliveriesForTest(1, 4),
    ])

    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = outcomes.find(result => result.status === 'rejected')
    expect(rejection).toMatchObject({
      reason: { code: '23514', constraint: 'ap_inbox_deliveries_unverified_capacity' },
    })
  })

  it('drains ten thousand owned expired unverified rows within one cleanup run', async () => {
    await insertActivityPubInboxCapacityDeliveriesForTest(
      ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRows,
      1,
      true,
    )

    const result = await drainOneCleanupRun()

    expect(result).toEqual({
      batches: 20,
      deletedRows: 10_000,
      deletedRawBodyBytes: 10_000,
      budgetExhausted: true,
    })
    expect(await getActivityPubInboxStorageSnapshot()).toEqual({
      retainedRows: 0,
      retainedRawBodyBytes: 0,
      unverifiedRows: 0,
      unverifiedRawBodyBytes: 0,
    })
  })

  it.each([
    ['unverified', 'idx_ap_inbox_deliveries__unverified_retention'],
    ['verified-operational', 'idx_ap_inbox_deliveries__verified_retention'],
  ] as const)('uses the matching partial index for %s cleanup', async (category, indexName) => {
    const query = buildExpireActivityPubInboxDeliveriesQuery(category, 1)
    expect(await explainActivityPubInboxCleanupForTest(query)).toContain(indexName)
  })
})

async function drainOneCleanupRun() {
  let batches = 0
  let deletedRows = 0
  let deletedRawBodyBytes = 0
  let lastBatchWasFull = false
  for (const category of ['unverified', 'verified-operational'] as const) {
    while (batches < ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches) {
      const batch = await expireActivityPubInboxDeliveries(
        category,
        ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize,
      )
      lastBatchWasFull = batch.deletedRows === ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupBatchSize
      if (batch.deletedRows > 0) {
        batches += 1
        deletedRows += batch.deletedRows
        deletedRawBodyBytes += batch.deletedRawBodyBytes
      }
      if (!lastBatchWasFull) break
    }
    if (batches >= ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches) break
  }
  return {
    batches,
    deletedRows,
    deletedRawBodyBytes,
    budgetExhausted:
      batches >= ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumCleanupBatches && lastBatchWasFull,
  }
}
