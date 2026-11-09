import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestUserWarning,
  readAllQueueJobs,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  makeAgentModelCaller,
  makeModelCallResult,
} from '@voucha/test-helpers/agents/model-call-result'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AppealResolutionJobData } from '@queues/ai-agents/types'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { processAppealResolution } from '../../../../workers/ai-agents/processors/process-appeal-resolution.mts'
import {
  appealResolutionRequestToken,
  markAppealResolutionRunFailed,
} from '@services/moderation-appeals/rerun-outcomes'

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
    const outcomePath = `/api/v1/appeals/${appeal.id}/resolution-drafts/${rerun.body.run_id}`
    expect((await request.get(outcomePath).expect(200)).body).toMatchObject({
      run_id: rerun.body.run_id,
      status: 'active',
      ai_drafted_at: null,
      latest_lifecycle_change_id: null,
    })
    await createRequest().get(outcomePath).expect(401)
    const appellantRequest = createRequest()
    await appellantRequest.authenticateAs(appellant)
    await appellantRequest.get(outcomePath).expect(403)
    await request
      .get(
        `/api/v1/appeals/${appeal.id}/resolution-drafts/appeal_resolution_${crypto.randomUUID()}`,
      )
      .expect(404)
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
      const modelStarted = Promise.withResolvers<void>()
      const releaseModel = Promise.withResolvers<void>()
      callModel.mockImplementation(async () => {
        modelStarted.resolve()
        await releaseModel.promise
        return makeModelCallResult({
          recommended_action: 'deny',
          public_response: 'We reviewed this appeal.',
          internal_response: 'The warning was warranted.',
        })
      })
      const processing = processAppealResolution(job! as Job<AppealResolutionJobData>, callModel)
      await modelStarted.promise
      const requestToken = appealResolutionRequestToken(rerun.body.run_id)
      expect(requestToken).not.toBeNull()
      await markAppealResolutionRunFailed(appeal.id, requestToken!)
      expect((await request.get(outcomePath).expect(200)).body).toMatchObject({
        status: 'failed',
        ai_drafted_at: null,
        latest_lifecycle_change_id: null,
      })
      releaseModel.resolve()
      await processing
      const completed = await request.get(detailPath).expect(200)
      expect(completed.body.appeal).toMatchObject({
        status: 'pending',
        recommended_action: 'deny',
        ai_public_response: 'We reviewed this appeal.',
        ai_drafted_at: expect.any(String),
        ai_draft_run_id: rerun.body.run_id,
        ai_draft_requested_run_id: rerun.body.run_id,
      })
      expect((await request.get(outcomePath).expect(200)).body).toMatchObject({
        run_id: rerun.body.run_id,
        status: 'succeeded',
        ai_drafted_at: completed.body.appeal.ai_drafted_at,
        latest_lifecycle_change_id: completed.body.appeal.latest_lifecycle_change_id,
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      await automaticJob?.remove()
      await job?.remove()
    }
  })
})
