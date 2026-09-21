import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { compensateFailedImageDeliveryMutation } from '@services/media-delivery-safety'
import { rollbackPostImages, type PostImageRollback } from './images-rollback.mts'

export async function completePostImageUpdate(input: {
  postId: string
  imageIds: string[]
  rollback: PostImageRollback
}): Promise<void> {
  const { postId, imageIds, rollback } = input
  // A detached image can again be a deliberately admitted generic preview. Recheck under the
  // shared lock now that the attachment commit is durable; this also publishes new tuples without
  // waiting for the periodic outbox reconciler.
  await compensateFailedImageDeliveryMutation({
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
