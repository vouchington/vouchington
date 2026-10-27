import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { postPublicationQueue } from '@queues/post-publication/queues'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

/** Observe only this test entity's native TestQueue admission during a committed mutation. */
export async function captureAddedPublicationEffectsForScope(
  scopeId: string,
  mutation: () => Promise<unknown>,
): Promise<PostPublicationEffectsJobData[]> {
  return captureAddedPublicationEffectsForScopes([scopeId], mutation)
}

/** Match an explicit set of synthetic test scopes without scanning the shared queue. */
export async function captureAddedPublicationEffectsForScopes(
  scopeIds: readonly string[],
  mutation: () => Promise<unknown>,
): Promise<PostPublicationEffectsJobData[]> {
  const owned = new Set(scopeIds)
  const ids = new Set<string>()
  const onAdded = (job: { id: string; name: string; data: unknown }) => {
    const data = job.data as Partial<PostPublicationEffectsJobData> | null
    if (
      job.name === POST_PUBLICATION_EFFECTS_JOB.name &&
      typeof job.id === 'string' &&
      typeof data?.scope?.id === 'string' &&
      owned.has(data.scope.id) &&
      !data.continuation
    )
      ids.add(job.id)
  }
  postPublicationQueue.on('added', onAdded)
  try {
    await mutation()
    const jobs = await Promise.all(
      [...ids].map(async id => {
        const job = await postPublicationQueue.getJob(id)
        if (!job) throw new Error(`Missing admitted publication job ${id}`)
        return job
      }),
    )
    await Promise.all(jobs.map(job => job.remove()))
    return jobs.map(job => job.data as PostPublicationEffectsJobData)
  } finally {
    postPublicationQueue.off('added', onAdded)
  }
}
