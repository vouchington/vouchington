import type { Job } from 'glide-mq'
import type { CopyrightFormScreeningJobData } from '@queues/ai-agents/types'
import { runCopyrightFormScreeningAgent } from '@agents/copyright-form-screening'
import { applyClearSignedInCopyrightFormScreening } from '@services/copyright-notices'
export async function processCopyrightFormScreening(
  job: Job<CopyrightFormScreeningJobData>,
): Promise<{ success: true }> {
  await runCopyrightFormScreeningAgent(job.data.submission_id)
  await applyClearSignedInCopyrightFormScreening(job.data.submission_id)
  return { success: true }
}
