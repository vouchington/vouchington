import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getReviewDisputeRunStatus,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { processExpireStuckDisputeResolutionRuns } from '../../workers/ai-agents/processors/process-expire-stuck-resolution-runs.mts'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { createReviewDispute } from './create.mts'
import { markReviewDisputeResolutionRunsFailed } from './resolution-runs.mts'

const LATER = () => new Date(Date.now() + 48 * 60 * 60 * 1000)

describe('expire stuck dispute resolution runs', () => {
  /** A dispute commits with its active run; a failed post-commit admission leaves it active. */
  async function makeStuckRun() {
    const staff = await createTestUser()
    const claimant = await createTestUser()
    const creator = await createTestUser()
    const reviewer = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Stuck Topic ${crypto.randomUUID()}`,
      slug: `stuck-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)
    const postId = await insertTestPost({
      title: `Stuck post ${crypto.randomUUID()}`,
      slug: `stuck-post-${crypto.randomUUID().slice(0, 8)}`,
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
    return dispute.ai_draft_requested_run_id!
  }

  it('expires an old active run on a later sweep tick', async () => {
    const runId = await makeStuckRun()
    expect(await getReviewDisputeRunStatus(runId)).toBe('active')

    const result = await processExpireStuckDisputeResolutionRuns({
      now: LATER(),
      runIds: [runId],
    })

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getReviewDisputeRunStatus(runId)).toBe('expired')
  })

  it('leaves a run younger than the age bound active', async () => {
    const runId = await makeStuckRun()

    await processExpireStuckDisputeResolutionRuns({ runIds: [runId] })

    expect(await getReviewDisputeRunStatus(runId)).toBe('active')
  })

  it('leaves a run that already finished unchanged', async () => {
    const runId = await makeStuckRun()
    expect(await markReviewDisputeResolutionRunsFailed([runId])).toBe(1)

    const result = await processExpireStuckDisputeResolutionRuns({
      now: LATER(),
      runIds: [runId],
    })

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getReviewDisputeRunStatus(runId)).toBe('failed')
  })

  it('caps one run at its page budget and the next tick resumes', async () => {
    const runIds = [await makeStuckRun(), await makeStuckRun()]

    const capped = await processExpireStuckDisputeResolutionRuns({
      now: LATER(),
      runIds,
      limits: { batchSize: 1, maxBatches: 1 },
    })
    expect(capped).toEqual({ deleted: 1, hasMore: true })
    const statuses = await Promise.all(runIds.map(id => getReviewDisputeRunStatus(id)))
    expect(statuses.toSorted((a, b) => a!.localeCompare(b!))).toEqual(['active', 'expired'])

    await processExpireStuckDisputeResolutionRuns({ now: LATER(), runIds })
    expect(await getReviewDisputeRunStatus(runIds[0]!)).toBe('expired')
    expect(await getReviewDisputeRunStatus(runIds[1]!)).toBe('expired')
  })
})
