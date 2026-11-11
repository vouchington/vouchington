import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from './index.mts'
import { getPostByAny } from '../services/posts/get.mts'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { publishStagedMediaDeliveryRecord } from '../services/media-delivery-safety/index.mts'
import { stageImagePlacementDeliveryRecord } from '../services/media-delivery-safety/delivery-registry-staging.mts'
import { installTestMediaDeliveryEdge } from './media-delivery-edge.mts'

export async function createTestPostDeliveryFixture(
  postType: 'discussion' | 'comment' = 'discussion',
) {
  const user = await createTestUserDirect()
  const rootId =
    postType === 'comment'
      ? await insertTestPost({
          title: `Delivery thread ${crypto.randomUUID()}`,
          slug: `delivery-thread-${crypto.randomUUID()}`,
          createdById: user.id,
          markdown: 'Root of the delivery recovery comment',
        })
      : null
  const postId = await insertTestPost({
    title: `Delivery recovery ${crypto.randomUUID()}`,
    slug: `delivery-recovery-${crypto.randomUUID()}`,
    createdById: user.id,
    markdown: 'Post with an image whose delivery must survive a failed mutation',
    postType,
    rootId,
    parentId: rootId,
  })
  const imageId = await insertTestImage(user.id)
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  const post = await getPostByAny(postId, { readOnly: false })
  if (!placement || !post) throw new Error('Post delivery fixture missing')
  const tuple = {
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId,
  }
  const edge = installTestMediaDeliveryEdge()
  const staged = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
  await publishStagedMediaDeliveryRecord(staged.mediaDeliveryRegistryRecordId)
  edge.put.mockClear()
  edge.invalidatePath.mockClear()
  const deliveryKey = getImagePlacementDeliveryKey(tuple)
  return {
    user,
    post,
    postId,
    imageId,
    placement,
    edge,
    deliveryKey,
    mediaDeliveryRegistryRecordId: staged.mediaDeliveryRegistryRecordId,
  }
}
