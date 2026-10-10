import { encodeScopedUuidCursor } from '@modules/pagination'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from './work-limits.mts'
import {
  enqueueReplayMediaDeliveryRegistry,
  type ReplayMediaDeliveryRegistryData,
} from '../../queues/notifications/enqueues.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  settleReplayFixtureOperations,
  createFailedMediaDeliveryReplayFixture,
} from '@voucha/test-helpers/copyright-route-replay-setup'
import { countTestCopyrightLifecycleEvents } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { getTestMediaDeliveryTransitionHistory } from '@voucha/test-helpers/entities/media-delivery-retry'
import { processReplayMediaDeliveryRegistry } from '../../workers/notifications/processors/media-delivery-registry.mts'
import { replayFailedMediaDeliveryRegistryRecords } from './delivery-registry-reconciliation.mts'

describe('media delivery replay jobs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('retries and overlaps chains without reopening a failed record twice', async () => {
    installTestMediaDeliveryEdge()
    const [first, second] = await settleReplayFixtureOperations([
      createFailedMediaDeliveryReplayFixture(),
      createFailedMediaDeliveryReplayFixture(),
    ])
    const fixtures = [first, second]
    const recordIds = fixtures.map(fixture => fixture.mediaDeliveryRegistryRecordId)
    const before = await settleReplayFixtureOperations(
      recordIds.map(getTestMediaDeliveryTransitionHistory),
    )
    const snapshots = await settleReplayFixtureOperations(
      recordIds.map(getTestMediaDeliveryRecordSnapshot),
    )
    expect(snapshots.every(snapshot => snapshot?.state === 'failed')).toBe(true)
    const keys = [
      encodeScopedUuidCursor(
        recordIds.toSorted()[0]!,
        JSON.stringify({
          operation: 'media-delivery-registry-replay',
          order: 'media-delivery-registry-record-id-asc',
          recordIds: recordIds.toSorted(),
          actorUserId: first.moderator.id,
        }),
      ),
    ]
    const continuations: ReplayMediaDeliveryRegistryData[] = []
    const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      registry_reconciliation_page_size: 1,
    })
    const dependencies = {
      enqueue: async (data: ReplayMediaDeliveryRegistryData) => {
        continuations.push(data)
        return enqueueReplayMediaDeliveryRegistry(data)
      },
      replay: (input: Parameters<typeof replayFailedMediaDeliveryRegistryRecords>[0]) =>
        replayFailedMediaDeliveryRegistryRecords({ ...input, recordIds }),
    }
    const data = { actorUserId: first.moderator.id }
    try {
      await settleReplayFixtureOperations([
        processReplayMediaDeliveryRegistry(data, dependencies),
        processReplayMediaDeliveryRegistry(data, dependencies),
      ])
      expect(
        continuations.every(
          next => next.after === keys[0] && next.actorUserId === data.actorUserId,
        ),
      ).toBe(true)
      const next = { ...data, after: keys[0] }
      await settleReplayFixtureOperations([
        processReplayMediaDeliveryRegistry(next, dependencies),
        processReplayMediaDeliveryRegistry(next, dependencies),
      ])
      await processReplayMediaDeliveryRegistry(next, dependencies)
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
            actorUserId: first.moderator.id,
          }),
        ).toBe(1)
      }
    } finally {
      restore()
    }
  })
})
