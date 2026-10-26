import type { Job } from 'glide-mq'
import { expect } from 'vitest'
import { withReservedAiUsageDay } from '../../../with-reserved-ai-usage-day.mts'
import { makeModelCallResult } from '../../../agents/model-call-result.mts'
import { ai_agents } from '../../../../queues/ai-agents/queues.mts'
import type { AppealResolutionJobData } from '../../../../queues/ai-agents/types.mts'
import { rerunModerationAppealResolutionDraft } from '../../../../services/moderation-appeals/rerun-resolution-draft.mts'
import { processAppealResolution } from '../../../../workers/ai-agents/processors/process-appeal-resolution.mts'

export async function rerunAppealResolutionThroughQueueForTest(
  staffUserId: string,
  appealId: string,
): Promise<void> {
  const admittedRunId = await rerunModerationAppealResolutionDraft(staffUserId, appealId)
  const job = await ai_agents.getJob(admittedRunId)
  if (!job) throw new Error(`Appeal-resolution rerun did not enqueue a job for ${appealId}`)
  try {
    expect(job.name).toBe('appeal-resolution')
    expect(job.data).toMatchObject({ appeal_id: appealId, rerun_by_id: staffUserId })
    const appealData = job.data as AppealResolutionJobData
    expect(appealData.ai_draft_request_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(job.id).toBe(`appeal_resolution_${appealData.ai_draft_request_token}`)
    expect(job.opts.jobId).toBe(job.id)
    expect(job.opts.deduplication).toBeUndefined()
    expect(job.opts.ordering).toEqual({ key: `appeal_resolution_${appealId}`, concurrency: 1 })
    await withReservedAiUsageDay(1_000_000, () =>
      processQueuedAppealResolution(job as Job<AppealResolutionJobData>, appealId),
    )
  } finally {
    await job.remove()
  }
}

async function processQueuedAppealResolution(
  job: Job<AppealResolutionJobData>,
  appealId: string,
): Promise<void> {
  await processAppealResolution(job, () =>
    Promise.resolve(
      makeModelCallResult(
        {
          recommended_action: 'deny',
          public_response: 'Deterministic queued rerun response.',
          internal_response: 'Deterministic queued rerun reasoning.',
        },
        { responseId: `test-appeal-resolution-${appealId}` },
      ),
    ),
  )
}
