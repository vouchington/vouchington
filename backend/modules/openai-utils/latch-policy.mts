import {
  isExplicitClientCancelError,
  shouldLatchUnknownBilledOpenAIAttempt,
} from '@vouchington/ai/openai'

/**
 * Whether a failed Responses attempt needs the unknown-billed latch. The caller's own cancellation
 * never does: latching fails the whole day's spend cap closed and parks every agent job, so an
 * aborted request is accepted as unrecorded rather than escalated.
 */
export function shouldLatchUnknownBilledAttempt(error: unknown): boolean {
  return !isExplicitClientCancelError(error) && shouldLatchUnknownBilledOpenAIAttempt(error)
}
