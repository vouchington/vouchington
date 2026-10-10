import type { Job } from 'glide-mq'
import { entitiesListeners } from '../workers/entity-listeners/workers.mts'

/** Waits for a new owned event, without accepting a previously completed job or a drained worker. */
export async function withTestEntityListenerCompletion<T>(
  jobName: string,
  entityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const completion = Promise.withResolvers<void>()
  const matches = (job: Job | undefined) => job?.name === jobName && job.data.id === entityId
  const completed = (job: Job) => {
    if (matches(job)) completion.resolve()
  }
  const failed = (job: Job | undefined, error: Error) => {
    if (matches(job)) completion.reject(error)
  }
  const deadline = AbortSignal.timeout(15_000)
  const aborted = () => completion.reject(deadline.reason)
  deadline.addEventListener('abort', aborted, { once: true })
  entitiesListeners.on('completed', completed)
  entitiesListeners.on('failed', failed)
  try {
    const [result] = await Promise.all([operation(), completion.promise])
    return result
  } finally {
    deadline.removeEventListener('abort', aborted)
    entitiesListeners.off('completed', completed)
    entitiesListeners.off('failed', failed)
  }
}
