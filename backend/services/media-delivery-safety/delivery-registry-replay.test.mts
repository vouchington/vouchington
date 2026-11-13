import { encodeScopedUuidCursor } from '@modules/pagination'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers'
import { notifications } from '../../queues/notifications/queues.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  settleReplayFixtureOperations,
  createFailedMediaDeliveryReplayFixture,
} from '@voucha/test-helpers/copyright-route-replay-setup'
import { countTestCopyrightLifecycleEvents } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { getTestMediaDeliveryTransitionHistory } from '@voucha/test-helpers/entities/media-delivery-retry'
import { processReplayMediaDeliveryRegistry } from '../../workers/notifications/processors/media-delivery-registry.mts'

describe('media delivery replay jobs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['overlapping', 'committed'])(
    'retries %s chains without reopening a failed record twice',
    async schedule => {
      installTestMediaDeliveryEdge()
      const [first, second, excluded] = await settleReplayFixtureOperations([
        createFailedMediaDeliveryReplayFixture(),
        createFailedMediaDeliveryReplayFixture(),
        createFailedMediaDeliveryReplayFixture(),
      ])
      const excludedBefore = await getTestMediaDeliveryRecordSnapshot(
        excluded.mediaDeliveryRegistryRecordId,
      )
      expect(excludedBefore).toMatchObject({ state: 'failed' })
      const fixtures = [first, second]
      const recordIds = fixtures.map(fixture => fixture.mediaDeliveryRegistryRecordId)
      const before = await settleReplayFixtureOperations(
        recordIds.map(getTestMediaDeliveryTransitionHistory),
      )
      const snapshots = await settleReplayFixtureOperations(
        recordIds.map(getTestMediaDeliveryRecordSnapshot),
      )
      expect(snapshots.every(snapshot => snapshot?.state === 'failed')).toBe(true)
      const keys = recordIds.toSorted().map(recordId =>
        encodeScopedUuidCursor(
          recordId,
          JSON.stringify({
            operation: 'media-delivery-registry-replay',
            order: 'media-delivery-registry-record-id-asc',
            recordIds: recordIds.toSorted(),
            actorUserId: first.moderator.id,
          }),
        ),
      )
      const data = { actorUserId: first.moderator.id }
      if (schedule === 'overlapping') {
        await settleReplayFixtureOperations([
          processReplayMediaDeliveryRegistry(data, recordIds, 1),
          processReplayMediaDeliveryRegistry(data, recordIds, 1),
        ])
      } else {
        await processReplayMediaDeliveryRegistry(data, recordIds, 1)
        await processReplayMediaDeliveryRegistry(data, recordIds, 1)
      }
      expect(
        await notifications.searchJobs({
          name: 'notifications.processReplayMediaDeliveryRegistry',
          data: { ...data, after: keys[0] },
        }),
      ).toHaveLength(1)
      const next = { ...data, after: keys[0] }
      await settleReplayFixtureOperations([
        processReplayMediaDeliveryRegistry(next, recordIds, 1),
        processReplayMediaDeliveryRegistry(next, recordIds, 1),
      ])
      await processReplayMediaDeliveryRegistry(next, recordIds, 1)
      const continuationJobs = await notifications.searchJobs({
        name: 'notifications.processReplayMediaDeliveryRegistry',
        data: { actorUserId: data.actorUserId },
      })
      expect(continuationJobs).toHaveLength(2)
      expect(continuationJobs.map(job => (job.data as { after?: string }).after)).toEqual(
        expect.arrayContaining([keys[0], keys[1]]),
      )
      expect(
        await getTestMediaDeliveryRecordSnapshot(excluded.mediaDeliveryRegistryRecordId),
      ).toEqual(excludedBefore)
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
    },
  )
})
