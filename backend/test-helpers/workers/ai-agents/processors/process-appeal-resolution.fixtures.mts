import type { Job } from 'glide-mq'
import { expect, vi } from 'vitest'
import { makeModelCallResult } from '../../../agents/model-call-result.mts'
import { ai_agents } from '../../../../queues/ai-agents/queues.mts'
import type { AppealResolutionJobData } from '../../../../queues/ai-agents/types.mts'
import { rerunModerationAppealResolutionDraft } from '../../../../services/moderation-appeals/rerun-resolution-draft.mts'
import { processAppealResolution } from '../../../../workers/ai-agents/processors/process-appeal-resolution.mts'

export async function rerunAppealResolutionThroughQueueForTest(
  staffUserId: string,
  appealId: string,
): Promise<void> {
  const job = await captureAppealResolutionEnqueue(staffUserId, appealId)
  await processQueuedAppealResolution(job, appealId)
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

async function captureAppealResolutionEnqueue(
  staffUserId: string,
  appealId: string,
): Promise<Job<AppealResolutionJobData>> {
  let job: Job<AppealResolutionJobData> | undefined
  let admittedRunId: string | undefined
  const add = vi.spyOn(ai_agents, 'add').mockImplementation(async (name, data, opts) => {
    expect(name).toBe('appeal-resolution')
    const appealData = data as AppealResolutionJobData
    expect(appealData).toMatchObject({ appeal_id: appealId, rerun_by_id: staffUserId })
    expect(appealData.ai_draft_request_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    const runId = `appeal_resolution_${appealData.ai_draft_request_token}`
    expect(opts?.jobId).toBe(runId)
    expect(opts?.deduplication).toBeUndefined()
    expect(opts?.ordering).toEqual({
      key: `appeal_resolution_${appealId}`,
      concurrency: 1,
    })
    job = { id: runId, name, data: appealData, opts } as Job<AppealResolutionJobData>
    return job
  })
  try {
    admittedRunId = await rerunModerationAppealResolutionDraft(staffUserId, appealId)
  } finally {
    add.mockRestore()
  }
  if (!job) throw new Error(`Appeal-resolution rerun did not enqueue a job for ${appealId}`)
  expect(admittedRunId).toBe(job.id)
  return job
}
