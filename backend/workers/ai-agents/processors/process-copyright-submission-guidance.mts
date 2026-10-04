import type { Job } from 'glide-mq'
import type { CopyrightSubmissionGuidanceJobData } from '@queues/ai-agents/types'
import { runCopyrightSubmissionGuidanceAgent } from '@agents/copyright-submission-guidance'

/** The agent persists advice only; moderator action is deliberately outside this processor. */
export async function processCopyrightSubmissionGuidance(
  job: Job<CopyrightSubmissionGuidanceJobData>,
): Promise<{ success: true }> {
  await runCopyrightSubmissionGuidanceAgent(job.data.submission_id)
  return { success: true }
}
