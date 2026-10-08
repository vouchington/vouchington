import { Worker } from 'glide-mq'
import type { ModelProviderError } from '@modules/model-providers/errors'
import { unrecoverable } from '@modules/queue-errors'

const DEFAULT_RATE_LIMIT_MS = 60_000

/**
 * Decides what a failed model call means for its job. A provider's rate limit or overload defers
 * the whole queue for the provider's `retry-after` (a minute when it sent none), like OpenAI's 429.
 * A permanent failure (a missing or rejected credential, exhausted credits, a refusal, or a billed
 * answer that failed validation) ends the job: retrying the same request cannot succeed, and a
 * retry after a billed turn would bill twice. Any other failure retries under the queue's attempts.
 */
export async function handleModelProviderError(
  error: ModelProviderError,
  worker: Pick<Worker, 'rateLimit'>,
): Promise<never> {
  if (error.code === 'rate-limited' || error.code === 'overloaded') {
    await worker.rateLimit(error.retryAfterMs ?? DEFAULT_RATE_LIMIT_MS)
    // oxlint-disable-next-line typescript/only-throw-error -- GlideMQ requires this control-flow signal to defer the job.
    throw new Worker.RateLimitError()
  }
  if (error.retryClass === 'permanent') unrecoverable(error)
  throw error
}
