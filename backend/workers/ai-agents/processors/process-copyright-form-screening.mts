import type { Job } from 'glide-mq'
import type { CopyrightFormScreeningJobData } from '@queues/ai-agents/types'
import { runCopyrightFormScreeningAgent } from '@agents/copyright-form-screening'
import { applyNonSpamSignedInCopyrightFormScreening } from '@services/copyright-notices'
export async function processCopyrightFormScreening(
  job: Job<CopyrightFormScreeningJobData>,
): Promise<{ success: true }> {
  await runCopyrightFormScreeningAgent(job.data.submission_id)
  await applyNonSpamSignedInCopyrightFormScreening(job.data.submission_id)
  return { success: true }
}
