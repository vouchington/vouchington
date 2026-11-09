import type { Job } from 'glide-mq'
import type { AppealResolutionJobData } from '@queues/ai-agents/types'
import { runAppealResolutionAgent, type AppealModelCaller } from '@agents/appeal-resolution'
import { loadServiceModelSelection } from '@services/ai-usage'
import { markAppealResolutionRunExpired } from '@services/moderation-appeals/rerun-outcomes'

export async function processAppealResolution(
  job: Job<AppealResolutionJobData>,
  callModel?: AppealModelCaller,
): Promise<unknown> {
  await runAppealResolutionAgent(
    {
      appealId: job.data.appeal_id,
      requestToken: job.data.ai_draft_request_token,
      rerunById: job.data.rerun_by_id ?? null,
      runId: job.id,
    },
    await loadServiceModelSelection('appeal-resolution'),
    callModel,
  )
  if (job.data.rerun_by_id) {
    await markAppealResolutionRunExpired(job.data.appeal_id, job.data.ai_draft_request_token)
  }
  return { success: true }
}
