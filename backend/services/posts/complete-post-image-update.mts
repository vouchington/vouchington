import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { repairFailedImageDeliveryMutation } from '@services/media-delivery-safety'
import { rollbackPostImages, type PostImageRollback } from './images-rollback.mts'

export async function completePostImageUpdate(input: {
  postId: string
  imageIds: string[]
  rollback: PostImageRollback
}): Promise<void> {
  const { postId, imageIds, rollback } = input
  // Repair existing exact-route denial markers against committed authority. Newly created
  // placement records publish through the outbox worker; enqueue below accelerates that work.
  await repairFailedImageDeliveryMutation({
    postIds: [postId],
    imageIds: [...new Set([...imageIds, ...rollback.images.map(image => image.image_id)])],
  })
  void enqueueReconcileMediaDeliveryRegistry()
  try {
    await enqueueOnPostUpdated(postId, { contentChanged: true })
  } catch (error) {
    await rollbackPostImages(postId, rollback)
    throw error
  }
}
