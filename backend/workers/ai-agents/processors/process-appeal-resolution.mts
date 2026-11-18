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
      runId: job.data.run_id,
      rerunById: job.data.rerun_by_id ?? null,
    },
    await loadServiceModelSelection('appeal-resolution'),
    callModel,
  )
  // The agent returned without failing. A run that saved a draft is already complete; any other
  // return means this request no longer applies, so it must not block the next admission.
  await markAppealResolutionRunExpired(job.data.appeal_id, job.data.run_id)
  return { success: true }
}
