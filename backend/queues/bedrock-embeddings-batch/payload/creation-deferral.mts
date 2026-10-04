import type { Job } from 'glide-mq'
import type { EmbeddingScanCursor } from '../types.mts'

export type EmbeddingCreationJob = Pick<Job, 'data' | 'updateData' | 'moveToDelayed'>

export async function delayEmbeddingCreationJob(
  job: EmbeddingCreationJob,
  cursor: EmbeddingScanCursor | undefined,
  delayMs = 0,
): Promise<never> {
  await job.updateData(cursor ? { cursor } : {})
  return job.moveToDelayed(Date.now() + delayMs)
}
