import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUserDirect, isDeduplicatedEnqueue } from '@voucha/test-helpers'
import {
  readTestAppliedMediaRegistryJobs,
  readTestMediaRegistryReconcileJobs,
} from '@voucha/test-helpers/media-delivery-recovery'
import {
  withTestMediaRecoveryBacklogWithOutsider,
  withTestInterleavedMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery-scope'
import {
  runAfterPostgresWriteForTest,
  rejectNextBackgroundJobAddBulkForTest,
  rejectNextBackgroundJobAddForTest,
  rejectPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'
import { listRecoverableMediaDeliveryRegistryIds } from '@services/media-delivery-safety'
import {
  enqueueContinueMediaDeliveryRegistryReconciliation,
  type ReconcileMediaDeliveryRegistryData,
} from '@queues/notifications/enqueues'
import { notifications } from '@queues/notifications/queues'
import { processReconcileMediaDeliveryRegistry } from './media-delivery-registry.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'

const continuationsFor = (scanBefore: string) =>
  readTestMediaRegistryReconcileJobs(data => 'scanBefore' in data && data.scanBefore === scanBefore)

async function appliedRecordIds(recordIds: readonly string[]): Promise<string[]> {
  const jobs = await readTestAppliedMediaRegistryJobs(recordIds)
  return jobs
    .map(
      job => (job.data as { mediaDeliveryRegistryRecordId: string }).mediaDeliveryRegistryRecordId,
    )
    .toSorted()
}

describe('durable media registry recovery hardening', () => {
  it('keeps its captured page budget when configuration is lowered during repair', async () => {
    installTestMediaDeliveryEdge()
    onTestFinished(() => {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    })
    const user = await createTestUserDirect()
    const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      recovery_page_size: 2,
    })
    try {
      await withTestMediaRecoveryBacklogWithOutsider(
        user.id,
        3,
        async ({ recordIds, scanBefore }) => {
          const options = { recordIds, imageIds: [], scanBefore }
          let loweredDuringRepair = false
          const restoreWrite = runAfterPostgresWriteForTest((statement, values) => {
            if (
              statement.includes('reconcileMediaDeliveryRepairMarkers:list') &&
              values.some(value => Array.isArray(value) && value.includes(recordIds[0]))
            ) {
              loweredDuringRepair = true
              overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
                recovery_page_size: 1,
              })
            }
          })
          try {
            expect(await processReconcileMediaDeliveryRegistry({}, options)).toEqual({
              enqueued: 2,
            })
            expect(loweredDuringRepair).toBe(true)
            expect(await appliedRecordIds(recordIds)).toEqual(recordIds.slice(0, 2))
            const continuations = await continuationsFor(scanBefore)
            expect(continuations).toHaveLength(1)
            expect(
              await processReconcileMediaDeliveryRegistry(
                continuations[0]!.data as ReconcileMediaDeliveryRegistryData,
                options,
              ),
            ).toEqual({ enqueued: 1 })
            expect(await appliedRecordIds(recordIds)).toEqual(recordIds)
            expect(await continuationsFor(scanBefore)).toHaveLength(1)
          } finally {
            restoreWrite()
          }
        },
      )
    } finally {
      restore()
    }
  })

  it('adds a recovery page through the default bulk enqueue with per-record dedup ids', async () => {
    const user = await createTestUserDirect()
    await withTestInterleavedMediaRecoveryBacklog(user.id, 3, async ({ recordIds, scanBefore }) => {
      const first = await listRecoverableMediaDeliveryRegistryIds({
        limit: 1,
        scanBefore,
        recordIds,
      })
      const data = { scanBefore, after: first.page_info.end_cursor! }

      expect(await processReconcileMediaDeliveryRegistry(data, { recordIds })).toEqual({
        enqueued: 2,
      })

      for (const mediaDeliveryRegistryRecordId of recordIds.slice(1)) {
        const jobs = await notifications.searchJobs({
          name: 'notifications.processApplyMediaDeliveryRegistryRecord',
          data: { mediaDeliveryRegistryRecordId },
        })
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.opts.deduplication?.id).toBe(
          `media-delivery-registry:${mediaDeliveryRegistryRecordId}`,
        )
      }
    })
  })

  it('enqueues 101 owned deliveries through persisted distinct continuation jobs', async () => {
    installTestMediaDeliveryEdge()
    onTestFinished(() => {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    })
    const user = await createTestUserDirect()
    await withTestInterleavedMediaRecoveryBacklog(
      user.id,
      102,
      async ({ recordIds, scanBefore, placements }) => {
        const first = await listRecoverableMediaDeliveryRegistryIds({
          limit: 1,
          scanBefore,
          recordIds,
        })
        const data = { scanBefore, after: first.page_info.end_cursor! }
        const options = { recordIds, imageIds: placements.map(placement => placement.imageId) }
        const restoreStage = rejectPostgresWriteForTest(
          'stageImagePlacementDeliveryRecordPage',
          new Error('Continuation must not stage authority'),
        )
        try {
          expect(await processReconcileMediaDeliveryRegistry(data, options)).toEqual({
            enqueued: 100,
          })
        } finally {
          restoreStage()
        }
        const continuations = await continuationsFor(scanBefore)
        expect(continuations).toHaveLength(1)
        const job = continuations[0]!
        expect(job).toMatchObject({
          name: 'notifications.processReconcileMediaDeliveryRegistry',
          data: { scanBefore },
          opts: { attempts: 3, removeOnComplete: 100, removeOnFail: 100 },
        })
        expect(job.opts.deduplication?.id).not.toBe('media-delivery-registry-reconciliation')
        const restoreRepair = rejectPostgresWriteForTest(
          'reconcileMediaDeliveryRepairMarkers:list',
          new Error('Continuation must not repair markers'),
        )
        try {
          expect(
            await processReconcileMediaDeliveryRegistry(
              job.data as ReconcileMediaDeliveryRegistryData,
              options,
            ),
          ).toEqual({ enqueued: 1 })
        } finally {
          restoreRepair()
        }
        expect(await continuationsFor(scanBefore)).toHaveLength(1)
        expect(await appliedRecordIds(recordIds.slice(1))).toEqual(recordIds.slice(1))
        // The bulk add keeps each registry record's own dedup id and retry budget.
        for (const child of await readTestAppliedMediaRegistryJobs(recordIds.slice(1))) {
          const { mediaDeliveryRegistryRecordId } = child.data as {
            mediaDeliveryRegistryRecordId: string
          }
          expect(child.opts).toMatchObject({
            attempts: 5,
            deduplication: {
              id: `media-delivery-registry:${mediaDeliveryRegistryRecordId}`,
              mode: 'throttle',
            },
          })
        }
        expect(
          isDeduplicatedEnqueue(
            await enqueueContinueMediaDeliveryRegistryReconciliation(
              job.data as Extract<ReconcileMediaDeliveryRegistryData, { scanBefore: string }>,
            ),
          ),
        ).toBe(true)
      },
    )
  })

  it('retries the same page after enqueue failure without advancing early', async () => {
    const user = await createTestUserDirect()
    await withTestInterleavedMediaRecoveryBacklog(
      user.id,
      102,
      async ({ recordIds, scanBefore }) => {
        const first = await listRecoverableMediaDeliveryRegistryIds({
          limit: 1,
          scanBefore,
          recordIds,
        })
        const data = { scanBefore, after: first.page_info.end_cursor! }
        const options = { recordIds }
        const restoreBulk = rejectNextBackgroundJobAddBulkForTest(
          'notifications.processApplyMediaDeliveryRegistryRecord',
          new Error('Owned enqueue failure'),
        )
        try {
          await expect(processReconcileMediaDeliveryRegistry(data, options)).rejects.toThrow(
            'Media delivery page enqueue failed',
          )
        } finally {
          restoreBulk()
        }
        expect(await appliedRecordIds(recordIds.slice(1))).toEqual([])
        expect(await continuationsFor(scanBefore)).toHaveLength(0)
        const restoreAdd = rejectNextBackgroundJobAddForTest(
          'notifications.processReconcileMediaDeliveryRegistry',
          new Error('Owned continuation enqueue failure'),
        )
        try {
          await expect(processReconcileMediaDeliveryRegistry(data, options)).rejects.toThrow(
            'Owned continuation enqueue failure',
          )
        } finally {
          restoreAdd()
        }
        expect(await continuationsFor(scanBefore)).toHaveLength(0)
        expect(await processReconcileMediaDeliveryRegistry(data, options)).toEqual({
          enqueued: 100,
        })
        const continuations = await continuationsFor(scanBefore)
        expect(continuations).toHaveLength(1)
        expect(continuations[0]!.data).toMatchObject({ scanBefore })
      },
    )
  })
})
