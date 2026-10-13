import type { Job } from 'glide-mq'
import type { ModelProviderError } from '@modules/model-providers/errors'
import { deferJobForRateLimit, unrecoverable } from '@modules/queue-errors'

/**
 * Decides what a failed model call means for its job. A provider's rate limit or overload parks
 * only this job for the provider's `retry-after` (a minute when it sent none, clamped) and does not
 * consume an attempt. The wait travels with the job, so each replica that receives a 429 honors it;
 * no worker is paused, because this queue also runs reconcilers that never call a provider and
 * must keep running. A permanent failure (a missing or rejected credential, exhausted credits, a
 * refusal, or a billed answer that failed validation) ends the job: retrying the same request
 * cannot succeed, and a retry after a billed turn would bill twice. Any other failure retries
 * under the queue's attempts.
 */
export async function handleModelProviderError(
  error: ModelProviderError,
  job: Pick<Job, 'moveToDelayed'>,
): Promise<never> {
  if (error.code === 'rate-limited' || error.code === 'overloaded') {
    return deferJobForRateLimit(job, error.retryAfterMs)
  }
  if (error.retryClass === 'permanent') unrecoverable(error)
  throw error
}
