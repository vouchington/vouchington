import { describe, expect, it } from 'vitest'
import { createTestUserDirect, isDeduplicatedEnqueue, readEnqueuedJob } from '@voucha/test-helpers'
import {
  scopedTestMediaRecoveryDependencies,
  withTestMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery'
import { listRecoverableMediaDeliveryRegistryKeys } from '@services/media-delivery-safety'
import {
  enqueueApplyMediaDeliveryRegistryRecord,
  enqueueContinueMediaDeliveryRegistryReconciliation,
  type ReconcileMediaDeliveryRegistryData,
} from '@queues/notifications/enqueues'
import { notifications } from '@queues/notifications/queues'
type EnqueueResult = Awaited<ReturnType<typeof enqueueApplyMediaDeliveryRegistryRecord>>
import { processReconcileMediaDeliveryRegistry } from './media-delivery-registry.mts'

describe('durable media registry recovery hardening', () => {
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
        enqueueApplyMediaDeliveryRegistryRecord: async (key: string) => {
          const result = await enqueueApplyMediaDeliveryRegistryRecord(key)
          children.push(result)
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
      expect(jobs.map(child => (child.data as { deliveryKey: string }).deliveryKey).sort()).toEqual(
        deliveryKeys.slice(1),
      )
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
        enqueueApplyMediaDeliveryRegistryRecord: async (key: string) => {
          if (failOnce && key === deliveryKeys[1]) {
            failOnce = false
            throw new Error('Owned enqueue failure')
          }
          return enqueueApplyMediaDeliveryRegistryRecord(key)
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
