import type { Job } from 'glide-mq'
import type { AppealResolutionJobData } from '@queues/ai-agents/types'
import { runAppealResolutionAgent, type AppealModelCaller } from '@agents/appeal-resolution'

export async function processAppealResolution(
  job: Job<AppealResolutionJobData>,
  callModel?: AppealModelCaller,
): Promise<unknown> {
  await runAppealResolutionAgent(
    {
      appealId: job.data.appeal_id,
      rerunById: job.data.rerun_by_id ?? null,
    },
    callModel,
  )
  return { success: true }
}
