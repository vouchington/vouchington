import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getReviewDisputeRunStatus,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  insertTestUserWarning,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { appealResolutionRunInputForTest } from '@voucha/test-helpers/appeal-resolution-run'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import {
  getAppealResolutionRunStatus,
  markAppealResolutionRunsFailed,
} from '@services/moderation-appeals/rerun-outcomes'
import { createReviewDispute } from '@services/review-disputes/create'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import { markReviewDisputeResolutionRunsFailed } from '@services/review-disputes/resolution-runs'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import {
  processExpireStuckAppealResolutionRuns,
  processExpireStuckDisputeResolutionRuns,
} from './process-expire-stuck-resolution-runs.mts'

const LATER = () => new Date(Date.now() + 48 * 60 * 60 * 1000)

describe('expire stuck appeal resolution runs', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  /** An appeal commits with its active run; a failed post-commit admission leaves it active. */
  async function makeStuckRun() {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const { appeal } = await createModerationAppeal(
      appellant,
      WEB_PROVENANCE,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: `Stuck run ${crypto.randomUUID()}`,
      }),
    )
    const { runId } = await appealResolutionRunInputForTest(appeal.id)
    return { appealId: appeal.id, runId }
  }

  it('expires an old active run on a later sweep tick', async () => {
    const { appealId, runId } = await makeStuckRun()
    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('active')

    const result = await processExpireStuckAppealResolutionRuns({
      now: LATER(),
      runIds: [runId],
    })

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('expired')
  })

  it('leaves a run younger than the age bound active', async () => {
    const { appealId, runId } = await makeStuckRun()

    await processExpireStuckAppealResolutionRuns({ runIds: [runId] })

    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('active')
  })

  it('leaves a run that already finished unchanged', async () => {
    const { appealId, runId } = await makeStuckRun()
    expect(await markAppealResolutionRunsFailed([{ appealId, runId }])).toBe(1)

    const result = await processExpireStuckAppealResolutionRuns({
      now: LATER(),
      runIds: [runId],
    })

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getAppealResolutionRunStatus(appealId, runId)).toBe('failed')
  })

  it('caps one run at its page budget and the next tick resumes', async () => {
    const first = await makeStuckRun()
    const second = await makeStuckRun()
    const runIds = [first.runId, second.runId]

    const capped = await processExpireStuckAppealResolutionRuns({
      now: LATER(),
      runIds,
      limits: { batchSize: 1, maxBatches: 1 },
    })
    expect(capped).toEqual({ deleted: 1, hasMore: true })
    const statuses = await Promise.all([
      getAppealResolutionRunStatus(first.appealId, first.runId),
      getAppealResolutionRunStatus(second.appealId, second.runId),
    ])
    expect(statuses.toSorted((a, b) => a!.localeCompare(b!))).toEqual(['active', 'expired'])

    await processExpireStuckAppealResolutionRuns({ now: LATER(), runIds })
    expect(await getAppealResolutionRunStatus(first.appealId, first.runId)).toBe('expired')
    expect(await getAppealResolutionRunStatus(second.appealId, second.runId)).toBe('expired')
  })
})

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
