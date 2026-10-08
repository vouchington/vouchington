import type { Job } from 'glide-mq'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
import { runDisputeResolutionAgent } from '@agents/dispute-resolution'
import { loadServiceModelSelection } from '@services/ai-usage'

export async function processDisputeResolution(
  job: Job<DisputeResolutionJobData>,
): Promise<unknown> {
  await runDisputeResolutionAgent(
    {
      disputeId: job.data.dispute_id,
      rerunById: job.data.rerun_by_id ?? null,
    },
    await loadServiceModelSelection('dispute-resolution'),
  )
  return { success: true }
}
