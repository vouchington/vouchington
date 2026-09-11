import type { Job } from 'glide-mq'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
import { runDisputeResolutionAgent } from '@agents/dispute-resolution'

export async function processDisputeResolution(
  job: Job<DisputeResolutionJobData>,
): Promise<unknown> {
  await runDisputeResolutionAgent({
    disputeId: job.data.dispute_id,
    rerunById: job.data.rerun_by_id ?? null,
  })
  return { success: true }
}
