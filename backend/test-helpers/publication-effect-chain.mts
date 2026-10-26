import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { postPublicationQueue } from '@queues/post-publication/queues'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

/** Execute admitted children directly; no worker scheduling, queue scans, or waiting. */
export async function executeTestPublicationChain(
  initial: PostPublicationEffectsJobData,
  execute: (data: PostPublicationEffectsJobData) => Promise<unknown>,
): Promise<Array<{ name: string; data: unknown }>> {
  const pending = [initial]
  const admitted = new Map<string, { id: string; name: string; data: unknown }>()
  const onAdded = (job: { id: string; name: string; data: unknown }) => {
    if (admitted.has(job.id)) return
    admitted.set(job.id, job)
    const data = job.data as Partial<PostPublicationEffectsJobData>
    if (job.name === POST_PUBLICATION_EFFECTS_JOB.name && data.changeId === initial.changeId)
      pending.push(job.data as PostPublicationEffectsJobData)
  }
  postPublicationQueue.on('added', onAdded)
  try {
    for (let index = 0; index < pending.length; index++) {
      if (index >= 500) throw new Error('Publication fixture produced an unexpected cycle')
      // Execute precisely the children admitted by the previous job, without a worker or polling.
      await execute(pending[index]!)
    }
    return [...admitted.values()].map(({ name, data }) => ({ name, data }))
  } finally {
    postPublicationQueue.off('added', onAdded)
    await Promise.all(
      [...admitted.keys()].map(async id => (await postPublicationQueue.getJob(id))?.remove()),
    )
  }
}
