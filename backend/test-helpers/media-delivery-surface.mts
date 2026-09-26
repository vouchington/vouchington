import { createTestUserDirect } from './entities/users.mts'
import { insertTestImage } from './entities/images.mts'
import {
  getTestImageSurfacePlacements,
  setTestUserProfileImage,
} from './entities/image-surface-placements.mts'
import { stageImagePlacementDeliveryRecord } from '../services/media-delivery-safety/delivery-registry-staging.mts'

export async function createTestDeliverySurface() {
  const user = await createTestUserDirect()
  const imageId = await insertTestImage(user.id)
  await setTestUserProfileImage(user.id, imageId)
  const [placement] = await getTestImageSurfacePlacements({ userId: user.id })
  if (!placement) throw new Error('Surface fixture missing')
  const tuple = {
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId,
  }
  const staged = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
  return { tuple, userId: user.id, deliveryKey: staged.deliveryKey }
}
