import { createMediaReplayOrderFixtures } from '@voucha/test-helpers/media-delivery-replay-order-fixtures'
import { afterAll, vi, describe, expect, it } from 'vitest'
import { closeTestDataStores } from '@voucha/test-helpers/close-data-stores'
import {
  createFailedMediaDeliveryReplayFixture,
  useTestMediaDeliveryReplayProviders,
  settleReplayFixtureOperations,
} from '@voucha/test-helpers/copyright-route-replay-setup'
import { countTestCopyrightLifecycleEvents } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  getTestMediaDeliveryRecordSnapshot,
  getTestMediaDeliveryTransitionHistory,
} from '@voucha/test-helpers/entities/media-delivery-retry'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { isDeduplicatedEnqueue, readEnqueuedJob } from '@voucha/test-helpers'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import {
  enqueueReplayMediaDeliveryRegistry,
  type ReplayMediaDeliveryRegistryData,
} from '../../queues/notifications/enqueues.mts'
import { notifications } from '../../queues/notifications/queues.mts'
import { processReplayMediaDeliveryRegistry } from '../../workers/notifications/processors/media-delivery-registry.mts'
import { replayFailedMediaDeliveryRegistryRecords } from './delivery-registry-reconciliation.mts'
import { mediaDeliverySafetyWorkConfig } from './work-limits.mts'
vi.mock<typeof import('@aws-sdk/client-cloudfront')>(
  import('@aws-sdk/client-cloudfront'),
  async importOriginal => {
    const actual = await importOriginal()
    vi.spyOn(actual.CloudFrontClient.prototype, 'send').mockResolvedValue({
      $metadata: {},
    } as never)
    return { ...actual }
  },
)
vi.mock<typeof import('@aws-sdk/client-dynamodb')>(
  import('@aws-sdk/client-dynamodb'),
  async importOriginal => {
    const actual = await importOriginal()
    vi.spyOn(actual.DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    return { ...actual }
  },
)
describe('media delivery replay jobs', () => {
  useTestMediaDeliveryReplayProviders()
  afterAll(closeTestDataStores)
  it('orders replay pages by record UUID and rejects cross-scope cursors before writes', async () => {
    const fixtures = await createMediaReplayOrderFixtures()
    const [first, second] = fixtures
    const firstId = first!.mediaDeliveryRegistryRecordId
    const secondId = second!.mediaDeliveryRegistryRecordId
    const recordIds = [firstId, secondId].toSorted()
    expect(recordIds).toEqual([secondId, firstId])
    expect([first!.placementId, second!.placementId].toSorted()).toEqual([
      first!.placementId,
      second!.placementId,
    ])
    const orderedSnapshots = await settleReplayFixtureOperations(
      [firstId, secondId].map(getTestMediaDeliveryRecordSnapshot),
    )
    const edgeKeys = orderedSnapshots.map(snapshot => String(snapshot!.delivery_key))
    expect(edgeKeys.toSorted()).toEqual(edgeKeys)
    const actorUserId = first!.moderator.id
    const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      registry_reconciliation_page_size: 1,
    })
    try {
      const page = await replayFailedMediaDeliveryRegistryRecords({ actorUserId, recordIds })
      expect(page).toMatchObject({ replayed: 1, hasMore: true })
      const scope = JSON.stringify({
        operation: 'media-delivery-registry-replay',
        order: 'media-delivery-registry-record-id-asc',
        recordIds,
        actorUserId,
      })
      expect(decodeScopedUuidCursor(page.after!, scope, 'Invalid media replay cursor').id).toBe(
        secondId,
      )
      const before = await settleReplayFixtureOperations(
        recordIds.map(getTestMediaDeliveryRecordSnapshot),
      )
      for (const input of [
        { actorUserId: first!.nonModerator.id, recordIds },
        { actorUserId, recordIds: [firstId] },
        { actorUserId, recordIds: [] },
      ]) {
        await expect(
          replayFailedMediaDeliveryRegistryRecords({ ...input, after: page.after }),
        ).rejects.toThrow('Invalid media replay cursor')
      }
      const recoveryCursor = encodeScopedUuidCursor(
        secondId,
        JSON.stringify({
          scanBefore: '2026-07-01T12:00:00.000Z',
          order: 'media-delivery-registry-record-id-asc',
          recordIds,
        }),
      )
      await expect(
        replayFailedMediaDeliveryRegistryRecords({ actorUserId, recordIds, after: recoveryCursor }),
      ).rejects.toThrow('Invalid media replay cursor')
      const continuations: ReplayMediaDeliveryRegistryData[] = []
      await expect(
        processReplayMediaDeliveryRegistry(
          { actorUserId: first!.nonModerator.id, after: page.after },
          {
            replay: input => replayFailedMediaDeliveryRegistryRecords({ ...input, recordIds }),
            enqueue: async next => {
              continuations.push(next)
              return enqueueReplayMediaDeliveryRegistry(next)
            },
          },
        ),
      ).rejects.toThrow('Invalid media replay cursor')
      expect(continuations).toEqual([])
      expect(
        await settleReplayFixtureOperations(recordIds.map(getTestMediaDeliveryRecordSnapshot)),
      ).toEqual(before)
      expect(
        await replayFailedMediaDeliveryRegistryRecords({
          actorUserId,
          recordIds: recordIds.toReversed().flatMap(id => [id.toUpperCase(), id]),
          after: page.after,
        }),
      ).toMatchObject({ replayed: 1, hasMore: true })
      expect(
        await settleReplayFixtureOperations(recordIds.map(getTestMediaDeliveryRecordSnapshot)),
      ).toEqual([
        expect.objectContaining({ state: 'pending' }),
        expect.objectContaining({ state: 'pending' }),
      ])
    } finally {
      restore()
    }
  })
  it('retries a committed page after continuation reply loss and drains remaining failed records', async () => {
    const fixtures = await settleReplayFixtureOperations([
      createFailedMediaDeliveryReplayFixture(),
      createFailedMediaDeliveryReplayFixture(),
      createFailedMediaDeliveryReplayFixture(),
    ])
    const recordIds = fixtures.map(fixture => fixture.mediaDeliveryRegistryRecordId).toSorted()
    const before = await settleReplayFixtureOperations(
      fixtures.map(fixture =>
        getTestMediaDeliveryTransitionHistory(fixture.mediaDeliveryRegistryRecordId),
      ),
    )
    const actorUserId = fixtures[0]!.moderator.id
    const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      registry_reconciliation_page_size: 1,
    })
    try {
      const accepted: ReplayMediaDeliveryRegistryData[] = []
      const replay = (input: Parameters<typeof replayFailedMediaDeliveryRegistryRecords>[0]) =>
        replayFailedMediaDeliveryRegistryRecords({ ...input, recordIds })
      const enqueueReplay = async (next: ReplayMediaDeliveryRegistryData) => {
        // Call through to the real queue, then model loss of its successful acceptance reply.
        const job = await enqueueReplayMediaDeliveryRegistry(next)
        if (isDeduplicatedEnqueue(job)) return job
        const persisted = await readEnqueuedJob(notifications, job)
        expect(persisted).toMatchObject({ name: 'processReplayMediaDeliveryRegistry', data: next })
        expect(
          await getTestMediaDeliveryRecordSnapshot(
            decodeScopedUuidCursor(
              next.after!,
              JSON.stringify({
                operation: 'media-delivery-registry-replay',
                order: 'media-delivery-registry-record-id-asc',
                recordIds,
                actorUserId,
              }),
              'Invalid media replay cursor',
            ).id,
          ),
        ).toMatchObject({ state: 'pending' })
        accepted.push(next)
        if (accepted.length === 1) throw new Error('Continuation acceptance reply lost')
        return job
      }
      const data = { actorUserId }
      await expect(
        processReplayMediaDeliveryRegistry(data, { replay, enqueue: enqueueReplay }),
      ).rejects.toThrow('Continuation acceptance reply lost')
      await processReplayMediaDeliveryRegistry(data, { replay, enqueue: enqueueReplay })
      expect(accepted).toHaveLength(2)
      expect(accepted[0]!.after).not.toBe(accepted[1]!.after)
      expect(isDeduplicatedEnqueue(await enqueueReplayMediaDeliveryRegistry(accepted[0]!))).toBe(
        true,
      )
      await settleReplayFixtureOperations(
        accepted.map(next =>
          processReplayMediaDeliveryRegistry(next, { replay, enqueue: enqueueReplay }),
        ),
      )
      for (const [index, fixture] of fixtures.entries()) {
        const history = await getTestMediaDeliveryTransitionHistory(
          fixture.mediaDeliveryRegistryRecordId,
        )
        expect(history.slice(before[index]!.length)).toEqual([
          expect.objectContaining({ change_type: 'pending' }),
        ])
        expect(
          await countTestCopyrightLifecycleEvents({
            noticeId: fixture.noticeId,
            eventType: 'media_delivery_registry_replayed',
            actorUserId,
          }),
        ).toBe(1)
      }
    } finally {
      restore()
    }
  })
})
