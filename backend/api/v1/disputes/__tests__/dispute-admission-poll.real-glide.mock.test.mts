import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  readAllQueueJobs,
  getReviewDisputeActiveRunId,
  getReviewDisputeRunStatus,
} from '@voucha/test-helpers'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { makeAgentModelCaller } from '@voucha/test-helpers/agents/model-call-result'
import { ai_agents } from '@queues/ai-agents/queues'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
import { disputeResolutionJobId } from '@queues/ai-agents/enqueues/dispute-resolution'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import { createReviewDispute } from '@services/review-disputes/create'
import { createReviewDisputeDraft } from '@services/review-disputes/create-dispute-draft'
import { updateReviewDisputeDraft } from '@services/review-disputes/update-dispute-draft'
import { processDisputeResolution } from '../../../../workers/ai-agents/processors/process-dispute-resolution.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('dispute resolution queue admission and result polling', () => {
  it('returns pending before the processor runs and exposes the persisted draft on detail read', async () => {
    const staff = await createTestUser({ administrator: true })
    await createTestMembership({ user_id: staff.id, plan: 'plus' })
    const creator = await createTestUser()
    const claimant = await createTestUser()
    const reviewer = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Admission Topic ${crypto.randomUUID()}`,
      slug: `admission-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)
    const postId = await insertTestPost({
      title: `Dispute admission ${crypto.randomUUID()}`,
      slug: `dispute-admission-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'A review to dispute.',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 1)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'defamatory',
      claim_text: `Claim ${crypto.randomUUID()}`,
    })
    const { dispute } = await createReviewDispute(claimant, input)
    const request = createRequest()
    await request.authenticateAs(staff)
    const path = `/api/v1/disputes/${dispute.id}`
    const automaticRunId = await getReviewDisputeActiveRunId(dispute.id)
    // Admission is idempotent: a rerun while the automatic run is active reads that run.
    const duplicate = await request
      .post(`/api/v1/disputes/${dispute.id}/resolution-drafts`)
      .expect(202)
    expect(duplicate.body).toMatchObject({ queued: true, run_id: automaticRunId })
    expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
      status: 'pending',
      ai_drafted_at: null,
      ai_draft_run_id: null,
      ai_draft_requested_run_id: automaticRunId,
      ai_draft_requested_run_status: 'active',
    })
    const jobs = await readAllQueueJobs(ai_agents)
    const automaticJob = jobs.find(
      candidate => candidate.id === disputeResolutionJobId(automaticRunId),
    )
    expect(automaticJob).toBeDefined()
    expect(automaticJob?.data).toMatchObject({ dispute_id: dispute.id, run_id: automaticRunId })
    let rerunJob: Job<DisputeResolutionJobData> | null = null
    try {
      const automaticModel = makeAgentModelCaller({
        recommended_action: 'remove',
        public_response: 'Automatic result.',
        internal_response: 'Automatic reasoning.',
      })
      await processDisputeResolution(automaticJob! as Job<DisputeResolutionJobData>, automaticModel)
      expect(automaticModel).toHaveBeenCalledOnce()
      expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
        ai_draft_run_id: automaticRunId,
        ai_draft_requested_run_id: automaticRunId,
        ai_draft_requested_run_status: 'succeeded',
      })

      const rerun = await request
        .post(`/api/v1/disputes/${dispute.id}/resolution-drafts`)
        .expect(202)
      expect(rerun.body).toMatchObject({ queued: true, run_id: expect.any(String) })
      expect(rerun.body.run_id).not.toBe(automaticRunId)
      expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
        ai_draft_run_id: automaticRunId,
        ai_draft_requested_run_id: rerun.body.run_id,
        ai_draft_requested_run_status: 'active',
      })
      rerunJob = (await ai_agents.getJob(
        disputeResolutionJobId(rerun.body.run_id),
      )) as Job<DisputeResolutionJobData> | null
      expect(rerunJob?.data).toMatchObject({ run_id: rerun.body.run_id, rerun_by_id: staff.id })
      const callModel = makeAgentModelCaller({
        recommended_action: 'no_action',
        public_response: 'We reviewed the disputed review.',
        internal_response: 'No policy violation found.',
      })
      await processDisputeResolution(rerunJob!, callModel)
      expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
        status: 'pending',
        recommended_action: 'no_action',
        public_response: 'We reviewed the disputed review.',
        ai_drafted_at: expect.any(String),
        ai_draft_run_id: rerun.body.run_id,
        ai_draft_requested_run_id: rerun.body.run_id,
        ai_draft_requested_run_status: 'succeeded',
      })
      expect(callModel).toHaveBeenCalledOnce()
      const staleSave = await createReviewDisputeDraft({
        disputeId: dispute.id,
        runId: automaticRunId,
        recommendedAction: 'remove',
        aiPublicResponse: 'A finished run must not replace the requested rerun.',
        aiInternalResponse: 'Older finished run.',
        model: 'test-model',
      })
      expect(staleSave).toBeNull()
      await updateReviewDisputeDraft(staff.id, dispute.id, {
        internalNotes: 'Later staff lifecycle change.',
      })
      expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
        public_response: 'We reviewed the disputed review.',
        ai_draft_run_id: rerun.body.run_id,
        ai_draft_requested_run_id: rerun.body.run_id,
        internal_notes: 'Later staff lifecycle change.',
      })
      const mcpRead = await callStructuredMcpTool(
        { ...staff, membership_plan: 'plus' },
        'read_review_dispute',
        optionArgs('get', { id: dispute.id }),
        ['moderation:read'],
        { interface: 'mcp', credential: 'oauth', client: null, oauthClientId: crypto.randomUUID() },
      )
      const restDispute = (await request.get(path).expect(200)).body.dispute
      for (const field of [
        'ai_draft_run_id',
        'ai_draft_requested_run_id',
        'ai_draft_requested_run_status',
      ] as const) {
        expect((mcpRead.dispute as Record<string, unknown>)[field]).toBe(restDispute[field])
      }
      const mcpRerun = await callStructuredMcpTool(
        { ...staff, membership_plan: 'plus' },
        'rerun_review_resolution_draft',
        optionArgs('dispute', { id: dispute.id }),
        ['moderation:read', 'moderation:ai-rerun'],
        { interface: 'mcp', credential: 'oauth', client: null, oauthClientId: crypto.randomUUID() },
      )
      expect(mcpRerun).toMatchObject({
        queued: true,
        rerun_by_id: staff.id,
        run_id: expect.any(String),
      })
      expect(mcpRerun.run_id).not.toBe(rerun.body.run_id)
      expect(await getReviewDisputeRunStatus(String(mcpRerun.run_id))).toBe('active')
      const mcpJob = await ai_agents.getJob(disputeResolutionJobId(String(mcpRerun.run_id)))
      expect(mcpJob).not.toBeNull()
      await mcpJob?.remove()
    } finally {
      await rerunJob?.remove()
      await automaticJob?.remove()
    }
  })
})
