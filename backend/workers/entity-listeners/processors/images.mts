import { enqueueCopyrightStaydownUploadMatch } from '@services/copyright-notices/staydown-matches'
import { enqueueCreateImageModeration } from '@queues/openai-moderation/enqueues'

export const processImageCreated = async ({ id }: { id: string }): Promise<void> => {
  void enqueueCreateImageModeration(id)
  await enqueueCopyrightStaydownUploadMatch(id)
}

export const processImageUpdated = () => {}

export const processImageDeleted = () => {}
