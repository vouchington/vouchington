import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { backgroundQueue as postPublicationQueue } from './shared-background-queue.mts'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'

type AdmittedPublicationJob = { id: string; name: string; data: unknown }
const admissionObservers = new Set<(job: AdmittedPublicationJob) => void>()
const nativeAdd = postPublicationQueue.add
const nativeAddBulk = postPublicationQueue.addBulk
// Install before admission-fault wrappers capture the method, so accepted native prefixes
// remain observable even when an outer wrapper rejects the rest of a bulk call.
postPublicationQueue.add = async (...args) => {
  const job = await nativeAdd.apply(postPublicationQueue, args)
  if (job) for (const observe of admissionObservers) observe(job)
  return job
}
postPublicationQueue.addBulk = async jobs => {
  const admitted = await nativeAddBulk.call(postPublicationQueue, jobs)
  for (const job of admitted) {
    if (job) for (const observe of admissionObservers) observe(job)
  }
  return admitted
}

/** Observe only this test entity's native admission during a committed mutation. */
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
  includeContinuations = false,
): Promise<PostPublicationEffectsJobData[]> {
  const owned = new Set(scopeIds)
  const ids = new Set<string>()
  const onAdded = (job: AdmittedPublicationJob) => {
    const data = job.data as Partial<PostPublicationEffectsJobData> | null
    if (
      job.name === POST_PUBLICATION_EFFECTS_JOB.name &&
      typeof job.id === 'string' &&
      typeof data?.scope?.id === 'string' &&
      owned.has(data.scope.id) &&
      (includeContinuations || !data.continuation || (data.keys?.length ?? 0) > 0)
    )
      ids.add(job.id)
  }
  admissionObservers.add(onAdded)
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
    admissionObservers.delete(onAdded)
    postPublicationQueue.off('added', onAdded)
  }
}
