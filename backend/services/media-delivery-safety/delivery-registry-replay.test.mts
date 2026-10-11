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
  it.each(['overlapping', 'committed'])(
    'retries %s chains without reopening a failed record twice',
    async schedule => {
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
      const continuations: ReplayMediaDeliveryRegistryData[] = []
      const pages: Awaited<ReturnType<typeof replayFailedMediaDeliveryRegistryRecords>>[] = []
      const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
        registry_reconciliation_page_size: 1,
      })
      const dependencies = {
        enqueue: async (data: ReplayMediaDeliveryRegistryData) => {
          continuations.push(data)
          return enqueueReplayMediaDeliveryRegistry(data)
        },
        replay: async (input: Parameters<typeof replayFailedMediaDeliveryRegistryRecords>[0]) => {
          const page = await replayFailedMediaDeliveryRegistryRecords({ ...input, recordIds })
          pages.push(page)
          return page
        },
      }
      const data = { actorUserId: first.moderator.id }
      try {
        if (schedule === 'overlapping') {
          await settleReplayFixtureOperations([
            processReplayMediaDeliveryRegistry(data, dependencies),
            processReplayMediaDeliveryRegistry(data, dependencies),
          ])
        } else {
          await processReplayMediaDeliveryRegistry(data, dependencies)
          await processReplayMediaDeliveryRegistry(data, dependencies)
        }
        expect(continuations).toContainEqual({ ...data, after: keys[0] })
        expect(continuations.toSorted((a, b) => a.after!.localeCompare(b.after!))).toEqual(
          pages
            .filter(page => page.hasMore && page.after)
            .map(page => ({ ...data, after: page.after }))
            .toSorted((a, b) => a.after!.localeCompare(b.after!)),
        )
        expect(pages.map(page => page.after)).toEqual(
          expect.arrayContaining(keys.slice(0, schedule === 'committed' ? 2 : 1)),
        )
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
    },
  )
})
