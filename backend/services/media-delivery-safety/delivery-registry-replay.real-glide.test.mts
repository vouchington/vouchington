import { createMediaReplayOrderFixtures } from '@voucha/test-helpers/media-delivery-replay-order-fixtures'
import { afterAll, describe, expect, it, onTestFinished } from 'vitest'
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
import { runAfterBackgroundJobAddForTest } from '@voucha/test-helpers/injected-failures'
import { isDeduplicatedEnqueue, readEnqueuedJob } from '@voucha/test-helpers'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import {
  enqueueReplayMediaDeliveryRegistry,
  type ReplayMediaDeliveryRegistryData,
} from '../../queues/notifications/enqueues.mts'
import { notifications } from '../../queues/notifications/queues.mts'
import { processReplayMediaDeliveryRegistry } from '../../workers/notifications/processors/media-delivery-registry.mts'
import { replayFailedMediaDeliveryRegistryRecords } from './delivery-registry-reconciliation.mts'
describe('media delivery replay jobs', () => {
  useTestMediaDeliveryReplayProviders()
  afterAll(closeTestDataStores)
  it('orders replay pages by record UUID and rejects cross-scope cursors before writes', async () => {
    const fixtures = await createMediaReplayOrderFixtures()
    const excluded = await createFailedMediaDeliveryReplayFixture()
    const excludedBefore = await getTestMediaDeliveryRecordSnapshot(
      excluded.mediaDeliveryRegistryRecordId,
    )
    expect(excludedBefore).toMatchObject({ state: 'failed' })
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
    const page = await replayFailedMediaDeliveryRegistryRecords({ actorUserId, recordIds }, 1)
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
        replayFailedMediaDeliveryRegistryRecords({ ...input, after: page.after }, 1),
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
      replayFailedMediaDeliveryRegistryRecords(
        { actorUserId, recordIds, after: recoveryCursor },
        1,
      ),
    ).rejects.toThrow('Invalid media replay cursor')
    await expect(
      processReplayMediaDeliveryRegistry(
        { actorUserId: first!.nonModerator.id, after: page.after },
        recordIds,
        1,
      ),
    ).rejects.toThrow('Invalid media replay cursor')
    expect(
      await notifications.searchJobs({
        name: 'notifications.processReplayMediaDeliveryRegistry',
        data: { actorUserId: first!.nonModerator.id, after: page.after },
      }),
    ).toEqual([])
    expect(
      await settleReplayFixtureOperations(recordIds.map(getTestMediaDeliveryRecordSnapshot)),
    ).toEqual(before)
    expect(
      await replayFailedMediaDeliveryRegistryRecords(
        {
          actorUserId,
          recordIds: recordIds.toReversed().flatMap(id => [id.toUpperCase(), id]),
          after: page.after,
        },
        1,
      ),
    ).toMatchObject({ replayed: 1, hasMore: true })
    expect(
      await settleReplayFixtureOperations(recordIds.map(getTestMediaDeliveryRecordSnapshot)),
    ).toEqual([
      expect.objectContaining({ state: 'pending' }),
      expect.objectContaining({ state: 'pending' }),
    ])
    expect(
      await getTestMediaDeliveryRecordSnapshot(excluded.mediaDeliveryRegistryRecordId),
    ).toEqual(excludedBefore)
  })
  it('retries a committed page after continuation reply loss and drains remaining failed records', async () => {
    const fixtures = await settleReplayFixtureOperations([
      createFailedMediaDeliveryReplayFixture(),
      createFailedMediaDeliveryReplayFixture(),
      createFailedMediaDeliveryReplayFixture(),
    ])
    const excluded = await createFailedMediaDeliveryReplayFixture()
    const excludedBefore = await getTestMediaDeliveryRecordSnapshot(
      excluded.mediaDeliveryRegistryRecordId,
    )
    expect(excludedBefore).toMatchObject({ state: 'failed' })
    const recordIds = fixtures.map(fixture => fixture.mediaDeliveryRegistryRecordId).toSorted()
    const before = await settleReplayFixtureOperations(
      fixtures.map(fixture =>
        getTestMediaDeliveryTransitionHistory(fixture.mediaDeliveryRegistryRecordId),
      ),
    )
    const actorUserId = fixtures[0]!.moderator.id
    const accepted: ReplayMediaDeliveryRegistryData[] = []
    const restore = runAfterBackgroundJobAddForTest(
      'notifications.processReplayMediaDeliveryRegistry',
      async (data, job) => {
        const next = data as ReplayMediaDeliveryRegistryData
        if (isDeduplicatedEnqueue(job)) return
        const persisted = await readEnqueuedJob(notifications, job)
        expect(persisted).toMatchObject({
          name: 'notifications.processReplayMediaDeliveryRegistry',
          data: next,
        })
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
      },
    )
    onTestFinished(restore)
    const data = { actorUserId }
    await expect(processReplayMediaDeliveryRegistry(data, recordIds, 1)).rejects.toThrow(
      'Continuation acceptance reply lost',
    )
    await processReplayMediaDeliveryRegistry(data, recordIds, 1)
    expect(accepted).toHaveLength(2)
    expect(accepted[0]!.after).not.toBe(accepted[1]!.after)
    expect(isDeduplicatedEnqueue(await enqueueReplayMediaDeliveryRegistry(accepted[0]!))).toBe(true)
    await settleReplayFixtureOperations(
      accepted.map(next => processReplayMediaDeliveryRegistry(next, recordIds, 1)),
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
    expect(
      await getTestMediaDeliveryRecordSnapshot(excluded.mediaDeliveryRegistryRecordId),
    ).toEqual(excludedBefore)
  })
})
