import { describe, expect, it } from 'vitest'
import { createTestUserDirect, isDeduplicatedEnqueue, readEnqueuedJob } from '@voucha/test-helpers'
import {
  scopedTestMediaRecoveryDependencies,
  withTestMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery'
import { listRecoverableMediaDeliveryRegistryKeys } from '@services/media-delivery-safety'
import {
  enqueueBulkApplyMediaDeliveryRegistryRecords,
  enqueueContinueMediaDeliveryRegistryReconciliation,
  type ReconcileMediaDeliveryRegistryData,
} from '@queues/notifications/enqueues'
import { notifications } from '@queues/notifications/queues'
type EnqueueResult = Awaited<ReturnType<typeof enqueueContinueMediaDeliveryRegistryReconciliation>>
import { processReconcileMediaDeliveryRegistry } from './media-delivery-registry.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'

describe('durable media registry recovery hardening', () => {
  it('keeps its captured page budget when configuration is lowered during repair', async () => {
    const user = await createTestUserDirect()
    overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, { recovery_page_size: 2 })
    await withTestMediaRecoveryBacklog(user.id, 3, async ({ deliveryKeys, scanBefore }) => {
      const accepted: string[] = []
      const continuations: ReconcileMediaDeliveryRegistryData[] = []
      const dependencies = {
        ...scopedTestMediaRecoveryDependencies(deliveryKeys),
        reconcileMediaDeliveryRepairMarkers: async (limit: number) => {
          expect(limit).toBe(2)
          overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
            recovery_page_size: 1,
          })
          return 0
        },
        stageAllCurrentImagePlacementDeliveryRecords: async () => 0,
        getMediaDeliveryRegistryScanBefore: async () => scanBefore,
        enqueueBulkApplyMediaDeliveryRegistryRecords: async (keys: string[]) => {
          accepted.push(...keys)
          return undefined
        },
        enqueueContinueMediaDeliveryRegistryReconciliation: async (
          next: Extract<ReconcileMediaDeliveryRegistryData, { scanBefore: string }>,
        ) => {
          continuations.push(next)
          return undefined
        },
      }
      expect(await processReconcileMediaDeliveryRegistry({}, dependencies)).toEqual({ enqueued: 2 })
      expect(accepted).toEqual(deliveryKeys.slice(0, 2))
      expect(continuations).toHaveLength(1)
      expect(await processReconcileMediaDeliveryRegistry(continuations[0], dependencies)).toEqual({
        enqueued: 1,
      })
      expect(accepted).toEqual(deliveryKeys)
      expect(continuations).toHaveLength(1)
    })
  })

  it('adds a recovery page through the default bulk enqueue with per-record dedup ids', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 3, async ({ deliveryKeys, scanBefore }) => {
      const first = await listRecoverableMediaDeliveryRegistryKeys({
        limit: 1,
        scanBefore,
        deliveryKeys,
      })
      const data = { scanBefore, after: first.page_info.end_cursor! }

      expect(
        await processReconcileMediaDeliveryRegistry(
          data,
          scopedTestMediaRecoveryDependencies(deliveryKeys),
        ),
      ).toEqual({ enqueued: 2 })

      for (const deliveryKey of deliveryKeys.slice(1)) {
        const jobs = await notifications.searchJobs({
          name: 'processApplyMediaDeliveryRegistryRecord',
          data: { deliveryKey },
        })
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.opts.deduplication?.id).toBe(`media-delivery-registry:${deliveryKey}`)
      }
    })
  })

  it('enqueues 101 owned deliveries through persisted distinct continuation jobs', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 102, async ({ deliveryKeys, scanBefore }) => {
      const first = await listRecoverableMediaDeliveryRegistryKeys({
        limit: 1,
        scanBefore,
        deliveryKeys,
      })
      const data = { scanBefore, after: first.page_info.end_cursor! }
      const children: EnqueueResult[] = []
      const continuations: EnqueueResult[] = []
      const dependencies = {
        ...scopedTestMediaRecoveryDependencies(deliveryKeys),
        stageAllCurrentImagePlacementDeliveryRecords: async () => {
          throw new Error('Continuation must not stage authority')
        },
        reconcileMediaDeliveryRepairMarkers: async () => {
          throw new Error('Continuation must not repair markers')
        },
        enqueueBulkApplyMediaDeliveryRegistryRecords: async (keys: string[]) => {
          const result = await enqueueBulkApplyMediaDeliveryRegistryRecords(keys)
          children.push(...(result as EnqueueResult[]))
          return result
        },
        enqueueContinueMediaDeliveryRegistryReconciliation: async (
          next: Extract<ReconcileMediaDeliveryRegistryData, { scanBefore: string }>,
        ) => {
          expect(children).toHaveLength(100)
          const result = await enqueueContinueMediaDeliveryRegistryReconciliation(next)
          continuations.push(result)
          return result
        },
      }
      expect(await processReconcileMediaDeliveryRegistry(data, dependencies)).toEqual({
        enqueued: 100,
      })
      expect(continuations).toHaveLength(1)
      const job = await readEnqueuedJob(notifications, continuations[0]!)
      expect(job).toMatchObject({
        name: 'processReconcileMediaDeliveryRegistry',
        data: { scanBefore },
        opts: { attempts: 3, removeOnComplete: 100, removeOnFail: 100 },
      })
      expect(job.opts.deduplication?.id).not.toBe('media-delivery-registry-reconciliation')
      expect(
        await processReconcileMediaDeliveryRegistry(
          job.data as ReconcileMediaDeliveryRegistryData,
          dependencies,
        ),
      ).toEqual({ enqueued: 1 })
      expect(continuations).toHaveLength(1)
      const jobs = await Promise.all(children.map(child => readEnqueuedJob(notifications, child)))
      expect(
        jobs.map(child => (child.data as { deliveryKey: string }).deliveryKey).toSorted(),
      ).toEqual(deliveryKeys.slice(1))
      // The bulk add keeps each registry record's own dedup id and retry budget.
      for (const child of jobs) {
        const { deliveryKey } = child.data as { deliveryKey: string }
        expect(child.opts).toMatchObject({
          attempts: 5,
          deduplication: { id: `media-delivery-registry:${deliveryKey}`, mode: 'throttle' },
        })
      }
      expect(
        isDeduplicatedEnqueue(
          await enqueueContinueMediaDeliveryRegistryReconciliation(
            job.data as Extract<ReconcileMediaDeliveryRegistryData, { scanBefore: string }>,
          ),
        ),
      ).toBe(true)
    })
  })
  it('retries the same page after enqueue failure without advancing early', async () => {
    const user = await createTestUserDirect()
    await withTestMediaRecoveryBacklog(user.id, 102, async ({ deliveryKeys, scanBefore }) => {
      const first = await listRecoverableMediaDeliveryRegistryKeys({
        limit: 1,
        scanBefore,
        deliveryKeys,
      })
      const data = { scanBefore, after: first.page_info.end_cursor! }
      let failOnce = true
      let failContinuationOnce = true
      const continuationJobs: EnqueueResult[] = []
      const dependencies = {
        ...scopedTestMediaRecoveryDependencies(deliveryKeys),
        enqueueBulkApplyMediaDeliveryRegistryRecords: async (keys: string[]) => {
          if (failOnce && keys.includes(deliveryKeys[1]!)) {
            failOnce = false
            throw new Error('Owned enqueue failure')
          }
          return enqueueBulkApplyMediaDeliveryRegistryRecords(keys)
        },
        enqueueContinueMediaDeliveryRegistryReconciliation: async (
          next: Extract<ReconcileMediaDeliveryRegistryData, { scanBefore: string }>,
        ) => {
          if (failContinuationOnce) {
            failContinuationOnce = false
            throw new Error('Owned continuation enqueue failure')
          }
          const result = await enqueueContinueMediaDeliveryRegistryReconciliation(next)
          continuationJobs.push(result)
          return result
        },
      }
      await expect(processReconcileMediaDeliveryRegistry(data, dependencies)).rejects.toThrow(
        'Media delivery page enqueue failed',
      )
      expect(continuationJobs).toHaveLength(0)
      await expect(processReconcileMediaDeliveryRegistry(data, dependencies)).rejects.toThrow(
        'Owned continuation enqueue failure',
      )
      expect(continuationJobs).toHaveLength(0)
      expect(await processReconcileMediaDeliveryRegistry(data, dependencies)).toEqual({
        enqueued: 100,
      })
      expect(continuationJobs).toHaveLength(1)
      expect((await readEnqueuedJob(notifications, continuationJobs[0]!)).data).toMatchObject({
        scanBefore,
      })
    })
  })
})
