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
} from '@voucha/test-helpers'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { makeAgentModelCaller } from '@voucha/test-helpers/agents/model-call-result'
import { ai_agents } from '@queues/ai-agents/queues'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
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
    const rerun = await request.post(`/api/v1/disputes/${dispute.id}/resolution-drafts`).expect(202)
    expect(rerun.body).toMatchObject({ queued: true, run_id: expect.any(String) })
    const path = `/api/v1/disputes/${dispute.id}`
    expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
      status: 'pending',
      ai_drafted_at: null,
    })
    const jobs = await readAllQueueJobs(ai_agents)
    const job = jobs.find(
      candidate =>
        candidate.name === 'dispute-resolution' &&
        'dispute_id' in candidate.data &&
        candidate.data.dispute_id === dispute.id &&
        'rerun_by_id' in candidate.data &&
        candidate.data.rerun_by_id === staff.id,
    )
    expect(job).toBeDefined()
    const automaticJob = jobs.find(
      candidate =>
        candidate.name === 'dispute-resolution' &&
        'dispute_id' in candidate.data &&
        candidate.data.dispute_id === dispute.id &&
        'rerun_by_id' in candidate.data &&
        candidate.data.rerun_by_id === null,
    )
    expect(automaticJob).toBeDefined()
    if (!automaticJob) throw new Error('Expected automatic dispute job')
    expect(rerun.body.run_id).toBe(job?.id)
    expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
      ai_draft_requested_run_id: rerun.body.run_id,
      ai_draft_run_id: null,
    })
    try {
      const staleModel = makeAgentModelCaller({
        recommended_action: 'remove',
        public_response: 'Older automatic result.',
        internal_response: 'Older automatic reasoning.',
      })
      await processDisputeResolution(automaticJob! as Job<DisputeResolutionJobData>, staleModel)
      expect(staleModel).not.toHaveBeenCalled()
      const callModel = makeAgentModelCaller({
        recommended_action: 'no_action',
        public_response: 'We reviewed the disputed review.',
        internal_response: 'No policy violation found.',
      })
      await processDisputeResolution(job! as Job<DisputeResolutionJobData>, callModel)
      expect((await request.get(path).expect(200)).body.dispute).toMatchObject({
        status: 'pending',
        recommended_action: 'no_action',
        public_response: 'We reviewed the disputed review.',
        ai_drafted_at: expect.any(String),
        ai_draft_run_id: rerun.body.run_id,
        ai_draft_requested_run_id: rerun.body.run_id,
      })
      expect(callModel).toHaveBeenCalledOnce()
      const staleSave = await createReviewDisputeDraft({
        disputeId: dispute.id,
        requestToken: (automaticJob.data as DisputeResolutionJobData).ai_draft_request_token,
        runId: automaticJob.id,
        recommendedAction: 'remove',
        aiPublicResponse: 'Older automatic draft must not replace the requested rerun.',
        aiInternalResponse: 'Older in-flight job.',
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
      const mcpJob = await ai_agents.getJob(String(mcpRerun.run_id))
      expect(mcpJob).not.toBeNull()
      await mcpJob?.remove()
    } finally {
      await job?.remove()
      await automaticJob?.remove()
    }
  })
})
