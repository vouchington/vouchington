import { describe, expect, it, onTestFinished } from 'vitest'
import { registerActivityPubInboxAdmission } from '@voucha/test-helpers/activitypub-inbox-transitions'
import { apInboxActivitiesWorkConfig } from '@services/ap-inbox-activities/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  deleteActivityPubInboxDeliveriesForTest,
  getExistingActivityPubInboxDeliveryIdsForTest,
} from '@voucha/test-helpers'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { insertExpiredVerifiedActivityPubInboxDeliveriesForTest } from '@voucha/test-helpers/entities/activitypub-inbox-owned-cleanup'
import {
  expireActivityPubInboxDeliveries,
  getActivityPubInboxStorageSnapshot,
} from '@services/ap-inbox-activities'
import { cleanupExpiredDeliveries } from './inbox.mts'

registerActivityPubInboxAdmission()

describe('ActivityPub inbox owned cleanup', () => {
  it('stops after two full pages, then continues the owned remainder without deleting a foreign row', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(apInboxActivitiesWorkConfig, {
        cleanup_batch_size: 2,
        cleanup_maximum_batches: 2,
      }),
    )
    const actor = await createRemoteActorFixture()
    let ownedIds: string[] = []
    let foreignIds: string[] = []

    try {
      foreignIds = await insertExpiredVerifiedActivityPubInboxDeliveriesForTest(1, actor.id)
      ownedIds = await insertExpiredVerifiedActivityPubInboxDeliveriesForTest(5, actor.id)
      expect(foreignIds).toHaveLength(1)
      expect(new Set(ownedIds).size).toBe(5)
      expect(
        await getExistingActivityPubInboxDeliveryIdsForTest([...ownedIds, ...foreignIds]),
      ).toHaveLength(6)

      const runOwnedCleanup = async () => {
        const queriedCategories: string[] = []
        const events: Record<string, unknown>[] = []
        const result = await cleanupExpiredDeliveries({
          expire: (category, limit) => {
            queriedCategories.push(category)
            return expireActivityPubInboxDeliveries(category, limit, ownedIds)
          },
          getSnapshot: getActivityPubInboxStorageSnapshot,
          log: event => {
            events.push(event)
          },
        })
        return { result, queriedCategories, events }
      }

      const first = await runOwnedCleanup()

      expect(first.queriedCategories).toEqual([
        'unverified',
        'verified-operational',
        'verified-operational',
      ])
      expect(first.result).toEqual({
        batches: 2,
        deletedRows: 4,
        deletedRawBodyBytes: 4,
        budgetExhausted: true,
      })
      const batchEvents = first.events.filter(
        event => event.event === 'activitypub_inbox_cleanup_batch',
      )
      expect(batchEvents).toHaveLength(2)
      expect(
        batchEvents.every(
          event =>
            event.category === 'verified-operational' &&
            event.deletedRows === 2 &&
            event.deletedRawBodyBytes === 2,
        ),
      ).toBe(true)
      expect(first.events.at(-1)).toMatchObject({
        event: 'activitypub_inbox_cleanup_snapshot',
        cleanupBatches: 2,
        budgetExhausted: true,
      })
      const remaining = await getExistingActivityPubInboxDeliveryIdsForTest(ownedIds)
      expect(remaining).toHaveLength(1)
      expect(ownedIds).toContain(remaining[0])
      expect(await getExistingActivityPubInboxDeliveryIdsForTest(foreignIds)).toEqual(foreignIds)

      const second = await runOwnedCleanup()
      expect(second.queriedCategories).toEqual(['unverified', 'verified-operational'])
      expect(second.result).toEqual({
        batches: 1,
        deletedRows: 1,
        deletedRawBodyBytes: 1,
        budgetExhausted: false,
      })
      expect(await getExistingActivityPubInboxDeliveryIdsForTest(ownedIds)).toEqual([])
      expect(await getExistingActivityPubInboxDeliveryIdsForTest(foreignIds)).toEqual(foreignIds)
    } finally {
      if (ownedIds.length > 0 || foreignIds.length > 0)
        await deleteActivityPubInboxDeliveriesForTest([...ownedIds, ...foreignIds])
    }
    expect(
      await getExistingActivityPubInboxDeliveryIdsForTest([...ownedIds, ...foreignIds]),
    ).toEqual([])
  })
})
