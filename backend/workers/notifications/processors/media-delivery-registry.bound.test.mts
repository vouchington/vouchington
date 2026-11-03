import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { insertTestImage } from '@voucha/test-helpers/entities/images'
import { setTestUserProfileImage } from '@voucha/test-helpers/entities/media-surface-writes'
import { getTestImageSurfacePlacements } from '@voucha/test-helpers/entities/image-surface-placements'
import {
  readTestMediaRegistryReconcileJobs,
  scopedTestMediaRecoveryDependencies,
  withTestMediaRecoveryBacklog,
} from '@voucha/test-helpers/media-delivery-recovery'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { mediaDeliverySafetyWorkConfig } from '@services/media-delivery-safety/work-limits'
import { stageImagePlacementDeliveryRecordPage } from '@services/media-delivery-safety'
import type { ReconcileMediaDeliveryRegistryData } from '@queues/notifications/enqueues'
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
          const stagingJobs = () =>
            readTestMediaRegistryReconcileJobs(
              job => 'staging' in job && job.staging?.scanBefore === scanBefore,
            )
          const dependencies = {
            ...scopedTestMediaRecoveryDependencies(recordIds),
            stageImagePlacementDeliveryRecordPage: (
              input: Parameters<typeof stageImagePlacementDeliveryRecordPage>[0],
            ) =>
              stageImagePlacementDeliveryRecordPage({
                ...input,
                imageIds: placements.map(row => row.imageId),
              }),
          }
          await processReconcileMediaDeliveryRegistry(data, dependencies)
          await processReconcileMediaDeliveryRegistry(data, dependencies)
          const next = { staging: { scanBefore, after: cursor(ordered[1]!) } }
          const persisted = await stagingJobs()
          expect(persisted).toHaveLength(1)
          const job = persisted[0]!
          expect(job).toMatchObject({
            name: 'notifications.processReconcileMediaDeliveryRegistry',
            data: next,
          })
          expect(job.opts.deduplication?.id).toBe(
            `media-delivery-registry-staging:${scanBefore}:${next.staging.after.placement_id}:${next.staging.after.placement_revision}:${next.staging.after.image_id}`,
          )
          await processReconcileMediaDeliveryRegistry(
            job.data as ReconcileMediaDeliveryRegistryData,
            dependencies,
          )
          expect(await stagingJobs()).toHaveLength(1)
        },
      )
    } finally {
      restore()
    }
  })
})

describe('media registry staging retired raw page', () => {
  it('enqueues the raw cursor across consecutive zero-stage retired tuples', async () => {
    const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      registry_reconciliation_page_size: 1,
    })
    try {
      const retiredOwner = await createTestUserDirect()
      const activeOwner = await createTestUserDirect()
      const retiredImageId = await insertTestImage(retiredOwner.id)
      const activeImageId = await insertTestImage(activeOwner.id)
      await setTestUserProfileImage(retiredOwner.id, retiredImageId)
      await setTestUserProfileImage(retiredOwner.id, null)
      await setTestUserProfileImage(activeOwner.id, activeImageId)
      const [retired] = await getTestImageSurfacePlacements({ imageId: retiredImageId })
      const [active] = await getTestImageSurfacePlacements({ imageId: activeImageId })
      if (!retired || !active) throw new Error('Missing owned staging placements')
      expect(retired.placement_id.localeCompare(active.placement_id)).toBeLessThan(0)
      expect(retired.retired_at).not.toBeNull()
      expect(active.retired_at).toBeNull()
      const stageResults: Awaited<ReturnType<typeof stageImagePlacementDeliveryRecordPage>>[] = []
      const stagingJobs = () =>
        readTestMediaRegistryReconcileJobs(
          job => 'staging' in job && job.staging?.after.placement_id === retired.placement_id,
        )
      const dependencies = {
        ...scopedTestMediaRecoveryDependencies([]),
        stageImagePlacementDeliveryRecordPage: async (
          input: Parameters<typeof stageImagePlacementDeliveryRecordPage>[0],
        ) => {
          const result = await stageImagePlacementDeliveryRecordPage(input)
          stageResults.push(result)
          return result
        },
      }
      const scanBefore = '2035-01-01T00:00:00.000Z'
      await processReconcileMediaDeliveryRegistry(
        {
          staging: {
            scanBefore,
            after: {
              placement_id: retired.placement_id,
              placement_revision: -1,
              image_id: '00000000-0000-0000-0000-000000000000',
            },
          },
        },
        dependencies,
      )
      expect(stageResults[0]).toMatchObject({ staged: 0, hasMore: true })
      const firstJobs = await stagingJobs()
      expect(firstJobs).toHaveLength(1)
      const job = firstJobs[0]!
      expect(job).toMatchObject({
        name: 'notifications.processReconcileMediaDeliveryRegistry',
        data: {
          staging: {
            scanBefore,
            after: {
              placement_id: retired.placement_id,
              image_id: retiredImageId,
            },
          },
        },
      })
      await processReconcileMediaDeliveryRegistry(
        job.data as ReconcileMediaDeliveryRegistryData,
        dependencies,
      )
      expect(stageResults[1]).toMatchObject({ staged: 0, hasMore: true })
      const allJobs = await stagingJobs()
      expect(allJobs).toHaveLength(2)
      expect(allJobs.map(({ data }) => data)).toContainEqual({
        staging: {
          scanBefore,
          after: {
            placement_id: retired.placement_id,
            placement_revision: retired.placement_revision,
            image_id: retiredImageId,
          },
        },
      })
    } finally {
      restore()
    }
  })
})
