import { StructuredDecisionError } from '@modules/structured-decisions'
import {
  CLASSIFIER_RUN_BACKOFF,
  CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS,
} from '@queues/ai-agents/config'

/**
 * The wait before a failed `classifier-run` job's next attempt: exponential from the base delay,
 * never shorter than the provider's `Retry-After` (capped, so a hostile or mistaken header cannot
 * park a run for hours), then jittered upward so runs that failed together do not retry together.
 *
 * `attemptsMade` counts the attempts made so far including the one that just failed, so the first
 * retry waits one base delay. The strategy only shapes the wait: whether to retry at all is decided
 * by the receipt, which ends a permanently rejected run without a queue retry.
 */
export function classifierRunBackoffMs(
  attemptsMade: number,
  error: Error,
  random: () => number = Math.random,
): number {
  const { delay, jitter } = CLASSIFIER_RUN_BACKOFF
  const exponential = delay * 2 ** (attemptsMade - 1)
  const retryAfter = error instanceof StructuredDecisionError ? (error.retryAfterMs ?? 0) : 0
  const base = Math.max(exponential, Math.min(retryAfter, CLASSIFIER_RUN_RETRY_AFTER_CEILING_MS))
  return Math.round(base * (1 + random() * jitter))
}
