import type { Job } from 'glide-mq'
import { expect, vi } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AppealResolutionJobData } from '@queues/ai-agents/types'
import { rerunModerationAppealResolutionDraft } from '@services/moderation-appeals/rerun-resolution-draft'
import { processAppealResolution } from './process-appeal-resolution.mts'

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
    Promise.resolve({
      id: `test-appeal-resolution-${appealId}`,
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                recommended_action: 'deny',
                public_response: 'Deterministic queued rerun response.',
                internal_response: 'Deterministic queued rerun reasoning.',
              }),
            },
          ],
        },
      ],
    }),
  )
}

async function captureAppealResolutionEnqueue(
  staffUserId: string,
  appealId: string,
): Promise<Job<AppealResolutionJobData>> {
  let job: Job<AppealResolutionJobData> | undefined
  const add = vi.spyOn(ai_agents, 'add').mockImplementation(async (name, data, opts) => {
    expect(name).toBe('appeal-resolution')
    const appealData = data as AppealResolutionJobData
    expect(appealData).toMatchObject({ appeal_id: appealId, rerun_by_id: staffUserId })
    expect(opts?.deduplication).toEqual({
      id: `appeal_resolution_manual_${appealId}`,
      mode: 'simple',
    })
    job = { name, data: appealData, opts } as Job<AppealResolutionJobData>
    return job
  })
  try {
    await rerunModerationAppealResolutionDraft(staffUserId, appealId)
  } finally {
    add.mockRestore()
  }
  if (!job) throw new Error(`Appeal-resolution rerun did not enqueue a job for ${appealId}`)
  return job
}
