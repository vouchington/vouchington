import * as notificationEnqueues from '@queues/notifications/enqueues'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  getTestImageSurfacePlacements,
  getTestUserRaw,
  insertTestImage,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getTestMediaDeliveryRegistryRecordId } from '@voucha/test-helpers/entities/image-surface-placements'
import { createProfileLink } from '../../my/profile-links.mts'
import { deleteUser } from '../delete.mts'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { processMediaDeliveryRegistryRecord } from '../../media-delivery-safety/index.mts'
import { processReconcileMediaDeliveryRegistry } from '../../../workers/notifications/processors/media-delivery-registry.mts'

describe('user deletion media authority', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('withholds owned profile-link delivery when user deletion commits', async () => {
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const link = await createProfileLink(user.id, {
      link_type: 'github',
      handle: `media-${crypto.randomUUID()}`,
      image_id: imageId,
    })
    const [placement] = await getTestImageSurfacePlacements({ profileLinkId: link.id })
    const tuple = {
      placementId: placement!.placement_id,
      revision: placement!.placement_revision,
      imageId,
    }
    const key = getImagePlacementDeliveryKey(tuple)
    const recordId = await getTestMediaDeliveryRegistryRecordId(tuple)
    expect(recordId).not.toBeNull()
    const edge = installTestMediaDeliveryEdge()
    await processMediaDeliveryRegistryRecord(recordId!)
    expect(edge.records.get(key)?.state).toBe('allow')
    const reconcile = vi.spyOn(notificationEnqueues, 'enqueueReconcileMediaDeliveryRegistry')
    await deleteUser(user, user)
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledWith()
    // The job payload is `{}`; the shared-DB test guard requires the processor options to scope
    // the run to this fixture, and they only narrow which rows it touches.
    await processReconcileMediaDeliveryRegistry({}, { recordIds: [recordId!], imageIds: [imageId] })
    await processMediaDeliveryRegistryRecord(recordId!)
    expect(edge.records.get(key)?.state).toBe('withheld')
    expect((await getTestUserRaw(user.id))?.deleted_at).toBeInstanceOf(Date)
  })

  it('still deletes the user when the reconcile enqueue fails', async () => {
    const user = await createTestUser()
    vi.spyOn(notificationEnqueues, 'enqueueReconcileMediaDeliveryRegistry').mockRejectedValueOnce(
      new Error('enqueue unavailable'),
    )
    await deleteUser(user, user)
    expect((await getTestUserRaw(user.id))?.deleted_at).toBeInstanceOf(Date)
  })
})
