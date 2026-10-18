import type { Job } from 'glide-mq'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
import { runDisputeResolutionAgent } from '@agents/dispute-resolution'
import type { DisputeModelCaller } from '@agents/dispute-resolution/run'
import { loadServiceModelSelection } from '@services/ai-usage'

export async function processDisputeResolution(
  job: Job<DisputeResolutionJobData>,
  callModel?: DisputeModelCaller,
): Promise<unknown> {
  await runDisputeResolutionAgent(
    {
      disputeId: job.data.dispute_id,
      rerunById: job.data.rerun_by_id ?? null,
    },
    await loadServiceModelSelection('dispute-resolution'),
    callModel,
  )
  return { success: true }
}
