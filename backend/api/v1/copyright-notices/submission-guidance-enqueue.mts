import onError from '@modules/on-error'
import { enqueueCopyrightSubmissionGuidanceAndWait } from '@queues/ai-agents/enqueues/copyright-submission-guidance'

/** A queue outage cannot roll back a committed statutory filing; the reconciler repairs it. */
export async function enqueueCopyrightSubmissionGuidanceBestEffort(
  submissionId: string,
): Promise<void> {
  try {
    await enqueueCopyrightSubmissionGuidanceAndWait(submissionId)
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Failed to enqueue copyright submission guidance', { cause: err }),
    )
  }
}
