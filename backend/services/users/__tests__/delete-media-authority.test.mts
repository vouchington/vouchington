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

describe('user deletion media authority', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('denies owned profile-link delivery before committing user deletion', async () => {
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
    let observedLiveOwner = false
    edge.put.mockImplementationOnce(async input => {
      observedLiveOwner = (await getTestUserRaw(user.id))?.deleted_at === null
      edge.accept(input)
      return { $metadata: {} }
    })
    await deleteUser(user, user)
    expect(observedLiveOwner).toBe(true)
    expect(edge.records.get(key)?.state).toBe('withheld')
    expect((await getTestUserRaw(user.id))?.deleted_at).toBeInstanceOf(Date)
  })
})
