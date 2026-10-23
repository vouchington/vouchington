import { getOpenAIRetryAfterMs, isOpenAIRateLimitError } from '@vouchington/ai/openai'
import type { Job } from 'glide-mq'
import {
  clampRateLimitDelayMs,
  deferJobForRateLimit,
  throwRateLimited,
} from '@vouchington/queue-errors'

export function getRetryAfterDuration(error: unknown): number {
  return getOpenAIRetryAfterMs(error, 60_000)
}

/** How long, in ms, a job that hit this 429 should wait: the clamped `Retry-After`, else a minute. */
export function getOpenAIRateLimitDelayMs(error: unknown): number {
  return clampRateLimitDelayMs(getRetryAfterDuration(error))
}

/**
 * Requeues the current job after the provider's `Retry-After` (a minute when it sent none) without
 * consuming an attempt. The wait travels with the job, so every replica that receives a 429 honors
 * it. A worker with a `limiter` also idles itself for that wait: use this on a queue whose jobs
 * all need OpenAI, and `deferJobForOpenAIRateLimit` where provider-free jobs share the worker.
 */
export async function handleOpenAIRateLimit(error: unknown): Promise<never> {
  assertOpenAIRateLimit(error)
  return throwRateLimited(getOpenAIRateLimitDelayMs(error), error)
}

/** Parks only the current job for the provider's `Retry-After`; other jobs keep running. */
export async function deferJobForOpenAIRateLimit(
  error: unknown,
  job: Pick<Job, 'moveToDelayed'>,
): Promise<never> {
  assertOpenAIRateLimit(error)
  return deferJobForRateLimit(job, getOpenAIRateLimitDelayMs(error))
}

function assertOpenAIRateLimit(error: unknown): void {
  if (isOpenAIRateLimitError(error)) return
  throw error instanceof Error
    ? error
    : new Error('OpenAI rate limit handling failed', { cause: error })
}
