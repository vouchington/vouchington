import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestUserWarning,
  readAllQueueJobs,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { makeAgentModelCaller } from '@voucha/test-helpers/agents/model-call-result'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AppealResolutionJobData } from '@queues/ai-agents/types'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { processAppealResolution } from '../../../../workers/ai-agents/processors/process-appeal-resolution.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('appeal resolution queue admission and result polling', () => {
  it('returns pending before a worker runs and exposes its persisted draft on the next detail read', async () => {
    const staff = await createTestUser({ administrator: true })
    const appellant = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `Admission test ${crypto.randomUUID()}`,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Appeal ${crypto.randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
    const request = createRequest()
    await request.authenticateAs(staff)
    const rerun = await request.post(`/api/v1/appeals/${appeal.id}/resolution-drafts`).expect(202)
    expect(rerun.body).toMatchObject({ queued: true, rerun_by_id: staff.id })
    expect(rerun.body.run_id).toMatch(/^appeal_resolution_[0-9a-f-]{36}$/)

    const detailPath = `/api/v1/appeals/${appeal.id}?consistency=primary`
    const pending = await request.get(detailPath).expect(200)
    expect(pending.body.appeal).toMatchObject({
      status: 'pending',
      ai_drafted_at: null,
      ai_draft_run_id: null,
      ai_draft_requested_run_id: rerun.body.run_id,
    })

    const jobs = await readAllQueueJobs(ai_agents)
    const automaticJob = jobs.find(
      candidate =>
        candidate.name === 'appeal-resolution' &&
        'appeal_id' in candidate.data &&
        candidate.data.appeal_id === appeal.id &&
        'rerun_by_id' in candidate.data &&
        candidate.data.rerun_by_id === null,
    )
    const job = jobs.find(
      candidate =>
        candidate.name === 'appeal-resolution' &&
        'appeal_id' in candidate.data &&
        candidate.data.appeal_id === appeal.id &&
        'rerun_by_id' in candidate.data &&
        candidate.data.rerun_by_id === staff.id,
    )
    expect(automaticJob).toBeDefined()
    expect(job).toBeDefined()
    try {
      const staleAutomaticModel = makeAgentModelCaller({
        recommended_action: 'accept',
        public_response: 'An older automatic draft.',
        internal_response: 'Stale automatic result.',
      })
      await processAppealResolution(
        automaticJob! as Job<AppealResolutionJobData>,
        staleAutomaticModel,
      )
      expect(staleAutomaticModel).not.toHaveBeenCalled()
      expect((await request.get(detailPath).expect(200)).body.appeal).toMatchObject({
        ai_draft_run_id: null,
        ai_draft_requested_run_id: rerun.body.run_id,
      })
      const callModel = makeAgentModelCaller({
        recommended_action: 'deny',
        public_response: 'We reviewed this appeal.',
        internal_response: 'The warning was warranted.',
      })
      await processAppealResolution(job! as Job<AppealResolutionJobData>, callModel)
      const completed = await request.get(detailPath).expect(200)
      expect(completed.body.appeal).toMatchObject({
        status: 'pending',
        recommended_action: 'deny',
        ai_public_response: 'We reviewed this appeal.',
        ai_drafted_at: expect.any(String),
        ai_draft_run_id: rerun.body.run_id,
        ai_draft_requested_run_id: rerun.body.run_id,
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      await automaticJob?.remove()
      await job?.remove()
    }
  })
})
