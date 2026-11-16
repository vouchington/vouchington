import type { Job } from 'glide-mq'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
import { runDisputeResolutionAgent } from '@agents/dispute-resolution'
import type { DisputeModelCaller } from '@agents/dispute-resolution/run'
import { loadServiceModelSelection } from '@services/ai-usage'
import { markReviewDisputeResolutionRunExpired } from '@services/review-disputes/resolution-runs'

export async function processDisputeResolution(
  job: Job<DisputeResolutionJobData>,
  callModel?: DisputeModelCaller,
): Promise<unknown> {
  await runDisputeResolutionAgent(
    {
      disputeId: job.data.dispute_id,
      runId: job.data.run_id,
      rerunById: job.data.rerun_by_id ?? null,
    },
    await loadServiceModelSelection('dispute-resolution'),
    callModel,
  )
  // The agent returned without failing. A run that saved a draft is already complete; any other
  // return means this request no longer applies, so it must not block the next admission.
  await markReviewDisputeResolutionRunExpired(job.data.run_id)
  return { success: true }
}
