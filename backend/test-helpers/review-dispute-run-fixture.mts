import {
  createTestMembership,
  createTestUser,
  getReviewDisputeActiveRunId,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from './index.mts'
import { createTopicClaim } from '../services/topic-claims/create.mts'
import { adminVerifyTopicClaim } from '../services/topic-claims/admin-verify.mts'
import { parseCreateReviewDisputeInput } from '../services/review-disputes/parse.mts'
import { createReviewDispute } from '../services/review-disputes/create.mts'

/** Opens a real dispute, which admits its automatic AI draft run. */
export async function createTestReviewDisputeWithRun(): Promise<{
  disputeId: string
  runId: string
}> {
  const staff = await createTestUser({ administrator: true })
  await createTestMembership({ user_id: staff.id, plan: 'plus' })
  const creator = await createTestUser()
  const claimant = await createTestUser()
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
    title: `Dispute run ${crypto.randomUUID()}`,
    slug: `dispute-run-${crypto.randomUUID().slice(0, 8)}`,
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
  return { disputeId: dispute.id, runId: await getReviewDisputeActiveRunId(dispute.id) }
}
