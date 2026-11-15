import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import type { Job } from 'glide-mq'
import type { DisputeResolutionJobData } from '@queues/ai-agents/types'
import { processDisputeResolution } from '../../workers/ai-agents/processors/process-dispute-resolution.mts'
import { write } from '@data-stores/psql'
import {
  createTestUser,
  getReviewDisputeRunStatus,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { createReviewDispute } from './create.mts'
import { createReviewDisputeDraft } from './create-dispute-draft.mts'
import { approveReviewDispute } from './approve-dispute.mts'
import { getReviewDisputeByIdFromPrimary } from './get.mts'
import {
  admitReviewDisputeResolutionRun,
  markReviewDisputeResolutionRunExpired,
  markReviewDisputeResolutionRunsFailed,
} from './resolution-runs.mts'

async function makeDispute() {
  const staff = await createTestUser()
  const claimant = await createTestUser()
  const creator = await createTestUser()
  const reviewer = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Run Topic ${crypto.randomUUID()}`,
    slug: `run-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
  })
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staff.id, claim.id)
  const postId = await insertTestPost({
    title: `Run post ${crypto.randomUUID()}`,
    slug: `run-post-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'A review to dispute.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 1)
  const { dispute } = await createReviewDispute(
    claimant,
    parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'defamatory',
      claim_text: `Claim ${crypto.randomUUID()}`,
    }),
  )
  return { dispute, staff }
}

const draft = (disputeId: string, runId: string) => ({
  disputeId,
  runId,
  recommendedAction: 'no_action' as const,
  aiPublicResponse: 'Public.',
  aiInternalResponse: 'Internal.',
  model: 'test-model',
})

describe('review dispute resolution runs', () => {
  it('admits one active run per dispute and returns it for duplicates', async () => {
    const { dispute } = await makeDispute()
    const admissions = await Promise.all([
      admitReviewDisputeResolutionRun(write, dispute.id),
      admitReviewDisputeResolutionRun(write, dispute.id),
      admitReviewDisputeResolutionRun(write, dispute.id),
    ])
    // Filing already admitted the automatic run, so every duplicate reads it.
    expect(admissions.every(admission => !admission.inserted)).toBe(true)
    expect(new Set(admissions.map(admission => admission.runId))).toEqual(
      new Set([dispute.ai_draft_requested_run_id]),
    )
    expect(dispute.ai_draft_requested_run_status).toBe('active')
  })

  it('admits a new run once the earlier one ended', async () => {
    const { dispute } = await makeDispute()
    const active = await admitReviewDisputeResolutionRun(write, dispute.id)
    await createReviewDisputeDraft(draft(dispute.id, active.runId))
    const next = await admitReviewDisputeResolutionRun(write, dispute.id)
    expect(next.inserted).toBe(true)
    expect(next.runId).not.toBe(active.runId)
  })

  it('refuses admission after approval', async () => {
    const { dispute, staff } = await makeDispute()
    const { runId } = await admitReviewDisputeResolutionRun(write, dispute.id)
    await createReviewDisputeDraft(draft(dispute.id, runId))
    await approveReviewDispute(staff.id, dispute.id)
    await expect(admitReviewDisputeResolutionRun(write, dispute.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('keeps success when a delayed failure arrives', async () => {
    const { dispute } = await makeDispute()
    const { runId } = await admitReviewDisputeResolutionRun(write, dispute.id)
    await createReviewDisputeDraft(draft(dispute.id, runId))

    expect(await markReviewDisputeResolutionRunsFailed([runId])).toBe(0)
    await markReviewDisputeResolutionRunExpired(runId)

    expect(await getReviewDisputeRunStatus(runId)).toBe('succeeded')
    expect(await getReviewDisputeByIdFromPrimary(dispute.id)).toMatchObject({
      ai_draft_run_id: runId,
      ai_draft_requested_run_id: runId,
      ai_draft_requested_run_status: 'succeeded',
    })
  })

  it('keeps the saved draft run id after retention retires the run row', async () => {
    const { dispute } = await makeDispute()
    const { runId } = await admitReviewDisputeResolutionRun(write, dispute.id)
    await createReviewDisputeDraft(draft(dispute.id, runId))

    await write(
      sql`/* retireTestRun */ DELETE FROM review_dispute_resolution_runs WHERE id = ${runId}::uuid`,
    )

    expect(await getReviewDisputeByIdFromPrimary(dispute.id)).toMatchObject({
      ai_draft_run_id: runId,
      ai_draft_requested_run_id: null,
      ai_draft_requested_run_status: null,
    })
  })

  it('does not save a draft for a run that already failed', async () => {
    const { dispute } = await makeDispute()
    const { runId } = await admitReviewDisputeResolutionRun(write, dispute.id)
    expect(await markReviewDisputeResolutionRunsFailed([runId])).toBe(1)

    expect(await createReviewDisputeDraft(draft(dispute.id, runId))).toBeNull()

    expect(await getReviewDisputeRunStatus(runId)).toBe('failed')
    expect((await getReviewDisputeByIdFromPrimary(dispute.id))?.ai_drafted_at).toBeNull()
  })

  it('expires a run the dispute no longer needs, releasing the next admission', async () => {
    const { dispute } = await makeDispute()
    const { runId } = await admitReviewDisputeResolutionRun(write, dispute.id)

    await markReviewDisputeResolutionRunExpired(runId)

    expect(await getReviewDisputeRunStatus(runId)).toBe('expired')
    expect(await createReviewDisputeDraft(draft(dispute.id, runId))).toBeNull()
    const next = await admitReviewDisputeResolutionRun(write, dispute.id)
    expect(next.inserted).toBe(true)
  })

  it('expires a superseded run when the worker finds the dispute already approved', async () => {
    const { dispute, staff } = await makeDispute()
    const first = await admitReviewDisputeResolutionRun(write, dispute.id)
    await createReviewDisputeDraft(draft(dispute.id, first.runId))
    const { runId } = await admitReviewDisputeResolutionRun(write, dispute.id)
    await approveReviewDispute(staff.id, dispute.id)

    await processDisputeResolution({
      data: { dispute_id: dispute.id, run_id: runId, rerun_by_id: staff.id },
    } as Job<DisputeResolutionJobData>)

    expect(await getReviewDisputeRunStatus(runId)).toBe('expired')
    expect(await getReviewDisputeRunStatus(first.runId)).toBe('succeeded')
  })
})
