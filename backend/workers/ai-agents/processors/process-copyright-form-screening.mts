import type { Job } from 'glide-mq'
import type { CopyrightFormScreeningJobData } from '@queues/ai-agents/types'
import {
  runCopyrightFormScreeningAgent,
  type CopyrightFormScreeningModelCaller,
} from '@agents/copyright-form-screening'
import { loadServiceModelSelection } from '@services/ai-usage'
import {
  applyNonSpamSignedInCopyrightFormScreening,
  isCopyrightIntakeEnabled,
} from '@services/copyright-notices'

export async function processCopyrightFormScreening(
  job: Job<CopyrightFormScreeningJobData>,
  callModel?: CopyrightFormScreeningModelCaller,
): Promise<{ success: true }> {
  if (!isCopyrightIntakeEnabled()) return { success: true }
  await runCopyrightFormScreeningAgent(
    job.data.submission_id,
    await loadServiceModelSelection('copyright-form-screening'),
    callModel,
  )
  await applyNonSpamSignedInCopyrightFormScreening(job.data.submission_id)
  return { success: true }
}
