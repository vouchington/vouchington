import type { Job } from 'glide-mq'
import type { AppealResolutionJobData } from '@queues/ai-agents/types'
import { runAppealResolutionAgent, type AppealModelCaller } from '@agents/appeal-resolution'
import { loadServiceModelSelection } from '@services/ai-usage'

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
  return { success: true }
}
