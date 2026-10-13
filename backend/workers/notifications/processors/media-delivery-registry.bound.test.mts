import { describe, expect, it } from 'vitest'
import { createTestUserDirect, readEnqueuedJob, isDeduplicatedEnqueue } from '@voucha/test-helpers'
import {
  scopedTestMediaRecoveryDependencies,
  withTestMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'
import { stageImagePlacementDeliveryRecordPage } from '@services/media-delivery-safety'
import {
  enqueueContinueMediaDeliveryRegistryStaging,
  type ReconcileMediaDeliveryRegistryData,
} from '@queues/notifications/enqueues'
import { notifications } from '@queues/notifications/queues'
import { processReconcileMediaDeliveryRegistry } from './media-delivery-registry.mts'

describe('media registry staging continuation', () => {
  it('persists one continuation for a retried full page and finishes the remaining owned page', async () => {
    const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      registry_reconciliation_page_size: 1,
    })
    try {
      const user = await createTestUserDirect()
      await withTestMediaRecoveryBacklog(
        user.id,
        3,
        async ({ recordIds, scanBefore, placements }) => {
          const ordered = placements.toSorted((left, right) =>
            left.placementId.localeCompare(right.placementId),
          )
          const cursor = (placement: (typeof placements)[number]) => ({
            placement_id: placement.placementId,
            placement_revision: placement.revision,
            image_id: placement.imageId,
          })
          const data = { staging: { scanBefore, after: cursor(ordered[0]!) } }
          const continuations: Awaited<
            ReturnType<typeof enqueueContinueMediaDeliveryRegistryStaging>
          >[] = []
          const dependencies = {
            ...scopedTestMediaRecoveryDependencies(recordIds),
            stageImagePlacementDeliveryRecordPage: (
              input: Parameters<typeof stageImagePlacementDeliveryRecordPage>[0],
            ) =>
              stageImagePlacementDeliveryRecordPage({
                ...input,
                imageIds: placements.map(row => row.imageId),
              }),
            enqueueContinueMediaDeliveryRegistryStaging: async (
              staging: NonNullable<ReconcileMediaDeliveryRegistryData['staging']>,
            ) => {
              const result = await enqueueContinueMediaDeliveryRegistryStaging(staging)
              continuations.push(result)
              return result
            },
          }
          await processReconcileMediaDeliveryRegistry(data, dependencies)
          await processReconcileMediaDeliveryRegistry(data, dependencies)
          const next = { staging: { scanBefore, after: cursor(ordered[1]!) } }
          expect(continuations).toHaveLength(2)
          expect(isDeduplicatedEnqueue(continuations[1]!)).toBe(true)
          const job = await readEnqueuedJob(notifications, continuations[0]!)
          expect(job).toMatchObject({ name: 'processReconcileMediaDeliveryRegistry', data: next })
          expect(job.opts.deduplication?.id).toBe(
            `media-delivery-registry-staging:${scanBefore}:${next.staging.after.placement_id}:${next.staging.after.placement_revision}:${next.staging.after.image_id}`,
          )
          await processReconcileMediaDeliveryRegistry(
            job.data as ReconcileMediaDeliveryRegistryData,
            dependencies,
          )
          expect(continuations).toHaveLength(2)
        },
      )
    } finally {
      restore()
    }
  })
})
