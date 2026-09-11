import { enqueueCreateImageModeration } from '@queues/openai-moderation/enqueues'

export const processImageCreated = ({ id }: { id: string }) => {
  void enqueueCreateImageModeration(id)
}

export const processImageUpdated = () => {}

export const processImageDeleted = () => {}
