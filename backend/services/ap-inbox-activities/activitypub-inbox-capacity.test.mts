import { describe, expect, it, onTestFinished } from 'vitest'
import { registerActivityPubInboxAdmission } from '@voucha/test-helpers/activitypub-inbox-transitions'
import {
  fillActivityPubInboxByteCapacity,
  fillActivityPubInboxRowCapacity,
} from '@voucha/test-helpers/activitypub-inbox-capacity-fixtures'
import {
  explainActivityPubInboxCleanupForTest,
  getExistingActivityPubInboxDeliveryIdsForTest,
  insertActivityPubInboxCapacityDeliveriesForTest,
  deleteActivityPubInboxDeliveriesForTest,
} from '@voucha/test-helpers'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { insertExpiredVerifiedActivityPubInboxDeliveriesForTest } from '@voucha/test-helpers/entities/activitypub-inbox-owned-cleanup'
import { createUnverifiedActivityPubCleanupFixture } from '@voucha/test-helpers/activitypub-inbox-unverified-cleanup'
import {
  buildExpireActivityPubInboxDeliveriesQuery,
  expireActivityPubInboxDeliveries,
  getActivityPubInboxStorageSnapshot,
} from '@services/ap-inbox-activities'
import { cleanupExpiredDeliveries } from '../../workers/activitypub/processors/inbox.mts'

registerActivityPubInboxAdmission('capacity')

describe('ActivityPub inbox capacity system boundary', () => {
  it('admits exactly the remaining row capacity under concurrent writes', async () => {
    const { filled } = await fillActivityPubInboxRowCapacity(1)
    const outcomes = await Promise.allSettled([
      insertActivityPubInboxCapacityDeliveriesForTest(1, 1),
      insertActivityPubInboxCapacityDeliveriesForTest(1, 1),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({
      reason: {
        code: '23514',
        constraint: 'activitypub_inbox_envelopes_unverified_capacity',
      },
    })
    expect(await getActivityPubInboxStorageSnapshot()).toEqual({
      retainedRows: filled.retainedRows + 1,
      retainedRawBodyBytes: filled.retainedRawBodyBytes + 1,
      unverifiedRows: filled.unverifiedRows + 1,
      unverifiedRawBodyBytes: filled.unverifiedRawBodyBytes + 1,
    })
  })

  it('admits exactly the remaining raw-body byte capacity under concurrent writes', async () => {
    const { filled } = await fillActivityPubInboxByteCapacity(6)
    const outcomes = await Promise.allSettled([
      insertActivityPubInboxCapacityDeliveriesForTest(1, 4),
      insertActivityPubInboxCapacityDeliveriesForTest(1, 4),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({
      reason: {
        code: '23514',
        constraint: 'activitypub_inbox_envelopes_unverified_capacity',
      },
    })
    expect(await getActivityPubInboxStorageSnapshot()).toEqual({
      retainedRows: filled.retainedRows + 1,
      retainedRawBodyBytes: filled.retainedRawBodyBytes + 4,
      unverifiedRows: filled.unverifiedRows + 1,
      unverifiedRawBodyBytes: filled.unverifiedRawBodyBytes + 4,
    })
  })

  it('cleans owned unverified eligibility before verified rows with exact ledger deltas and foreign preservation', async () => {
    const fixture = await createUnverifiedActivityPubCleanupFixture()
    const actor = await createRemoteActorFixture()
    const verified = await insertExpiredVerifiedActivityPubInboxDeliveriesForTest(1, actor.id)
    onTestFinished(() => deleteActivityPubInboxDeliveriesForTest(verified))
    const selected = [...fixture.ids, ...verified]
    const before = await getActivityPubInboxStorageSnapshot()
    const events: Record<string, unknown>[] = []
    const categories: string[] = []
    const result = await cleanupExpiredDeliveries({
      expire: (category, limit) => {
        categories.push(category)
        return expireActivityPubInboxDeliveries(category, limit, selected)
      },
      getSnapshot: getActivityPubInboxStorageSnapshot,
      log: event => events.push(event),
    })
    expect(categories).toEqual(['unverified', 'verified-operational'])
    expect(result).toEqual({
      batches: 2,
      deletedRows: 3,
      deletedRawBodyBytes: 9,
      budgetExhausted: false,
    })
    expect(events.filter(event => event.event === 'activitypub_inbox_cleanup_batch')).toMatchObject(
      [
        { category: 'unverified', deletedRows: 2, deletedRawBodyBytes: 8 },
        { category: 'verified-operational', deletedRows: 1, deletedRawBodyBytes: 1 },
      ],
    )
    expect(await getExistingActivityPubInboxDeliveryIdsForTest(selected)).toEqual(
      fixture.retained.toSorted(),
    )
    expect(await getExistingActivityPubInboxDeliveryIdsForTest(fixture.foreign)).toEqual(
      fixture.foreign,
    )
    expect(await getActivityPubInboxStorageSnapshot()).toEqual({
      retainedRows: before.retainedRows - 3,
      retainedRawBodyBytes: before.retainedRawBodyBytes - 9,
      unverifiedRows: before.unverifiedRows - 2,
      unverifiedRawBodyBytes: before.unverifiedRawBodyBytes - 8,
    })
  })

  it.for([
    ['unverified', 'idx_activitypub_inbox_envelopes__unverified_retention'],
    ['verified-operational', 'idx_activitypub_inbox_envelopes__verified_retention'],
  ] as const)('uses the matching partial index for %s cleanup', async ([category, indexName]) => {
    expect(
      await explainActivityPubInboxCleanupForTest(
        buildExpireActivityPubInboxDeliveriesQuery(category, 1),
      ),
    ).toContain(indexName)
  })
})
