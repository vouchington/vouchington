import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestPost, createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  expireAutotaggerReceiptLease,
  listAutotaggerReceiptAttempts,
} from '@voucha/test-helpers/data-stores/psql/autotagger-receipts'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import { sanitizeClassifierExternalContent } from '@agents/classifiers/safe-content'
import { getTopicElectionVote } from '@services/elections-votes/topic'
import {
  getActiveClassifierConfigurationBySlugFromPrimary,
  persistClassifierDecision,
} from '@services/classifiers'
import {
  claimAutotaggerReceipt,
  AUTOTAGGER_RECEIPT_DIGEST_VERSION,
  type AutotaggerReceiptSubject,
} from '@services/autotagger'
import { getAutotaggerClassifierSystemUserId } from '@services/users/system-users'
import {
  dispatchAutotaggerClassifier,
  type AutotaggerClassifierCandidate,
  type AutotaggerClassifierDispatchInput,
} from './dispatch-classifier.mts'
import { buildAutotaggerClassifierBindingsAndDigest } from './dispatch-classifier-bindings.mts'

// The seeded classifier every test in this file dispatches against (0635-00-02-seed-tagging-
// classifier.mts). Every conflicting `tagging`-classifier test was audited before this file was
// written (grep for `tagging` across `*.test.mts`): the rest either use "tagging" as an unrelated
// word or only SELECT this row, so concurrent workers dispatching against it is safe.
const TAGGING_SLUG = 'tagging'

async function buildDispatchFixture(topicCount = 1): Promise<{
  subject: AutotaggerReceiptSubject
  state: AutotaggerClassifierDispatchInput['state']
  candidates: AutotaggerClassifierCandidate[]
  topics: { id: string; name: string }[]
}> {
  const user = await createTestUser()
  const post = await createTestPost({ user })
  const topics = await Promise.all(
    Array.from({ length: topicCount }, () => createTestTopic({ user })),
  )
  const state = await sanitizeClassifierExternalContent(
    `Dispatch classifier test content ${randomUUID()}`,
    { source: 'post', contentType: 'user_post' },
  )
  return {
    subject: { postId: post.id, rssFeedItemId: null },
    state,
    candidates: topics.map(topic => ({ topicId: topic.id, name: topic.name })),
    topics,
  }
}

function expectSameTopicIds(actual: readonly string[] | undefined, expected: readonly string[]) {
  expect(new Set(actual)).toEqual(new Set(expected))
  expect(actual).toHaveLength(expected.length)
}

describe('dispatchAutotaggerClassifier', () => {
  it('dispatches once, persists the decision, and applies upvote/downvote topic votes', async () => {
    const { subject, state, candidates, topics } = await buildDispatchFixture(2)
    const upvoted = topics[0]!
    const downvoted = topics[1]!
    const fake = createFakeStructuredDecisionClient({ [upvoted.id]: 0.95, [downvoted.id]: 0.02 })

    const result = await dispatchAutotaggerClassifier(
      { subject, state, candidates, maxCandidates: candidates.length },
      { createClient: fake.createClient },
    )

    expect(fake.decide).toHaveBeenCalledTimes(1)
    expectSameTopicIds(result?.topicIds, [upvoted.id, downvoted.id])

    const actorId = await getAutotaggerClassifierSystemUserId()
    await expect(getTopicElectionVote(actorId, upvoted.id)).resolves.toMatchObject({
      choice: 'like',
    })
    await expect(getTopicElectionVote(actorId, downvoted.id)).resolves.toMatchObject({
      choice: 'dislike',
    })
  })

  it('replays an already-completed receipt idempotently: no re-dispatch, no re-applied votes', async () => {
    const { subject, state, candidates, topics } = await buildDispatchFixture(1)
    const topic = topics[0]!
    const fake = createFakeStructuredDecisionClient({ [topic.id]: 0.95 })
    const input: AutotaggerClassifierDispatchInput = {
      subject,
      state,
      candidates,
      maxCandidates: candidates.length,
    }

    const first = await dispatchAutotaggerClassifier(input, { createClient: fake.createClient })
    expect(fake.decide).toHaveBeenCalledTimes(1)
    expectSameTopicIds(first?.topicIds, [topic.id])

    // Same identity (subject/state/candidates/maxCandidates unchanged) -> the receipt is already
    // `completed`, so dispatch must not call decide() again. Vote application replays the same
    // batchId, which the `classifier_topic_vote_applications` ON CONFLICT fence (batch_id <
    // EXCLUDED.batch_id) treats as already-applied: it is a genuine no-op, not a re-apply of the
    // original topic IDs.
    const second = await dispatchAutotaggerClassifier(input, { createClient: fake.createClient })
    expect(fake.decide).toHaveBeenCalledTimes(1)
    expectSameTopicIds(second?.topicIds, [])

    const actorId = await getAutotaggerClassifierSystemUserId()
    await expect(getTopicElectionVote(actorId, topic.id)).resolves.toMatchObject({
      choice: 'like',
    })
  })

  it('dispatches a new receipt when maxCandidates changes for an identical candidate set', async () => {
    const { subject, state, candidates, topics } = await buildDispatchFixture(1)
    const topic = topics[0]!
    const fake = createFakeStructuredDecisionClient({ [topic.id]: 0.95 })

    const first = await dispatchAutotaggerClassifier(
      { subject, state, candidates, maxCandidates: 3 },
      { createClient: fake.createClient },
    )
    const second = await dispatchAutotaggerClassifier(
      { subject, state, candidates, maxCandidates: 10 },
      { createClient: fake.createClient },
    )

    expect(fake.decide).toHaveBeenCalledTimes(2)
    expectSameTopicIds(first?.topicIds, [topic.id])
    expectSameTopicIds(second?.topicIds, [topic.id])
  })

  it('throws on a live in-progress lease collision, without dispatching', async () => {
    const { subject, state, candidates } = await buildDispatchFixture(1)
    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_SLUG)
    if (!configuration) throw new Error('tagging classifier configuration not seeded')
    const input: AutotaggerClassifierDispatchInput = {
      subject,
      state,
      candidates,
      maxCandidates: candidates.length,
    }
    const { digest } = await buildAutotaggerClassifierBindingsAndDigest(configuration, input)

    const claimed = await claimAutotaggerReceipt({
      subject,
      digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
      digest,
      leaseSeconds: 60,
    })
    if (claimed.kind !== 'claimed') throw new Error('expected to claim the receipt')

    const fake = createFakeStructuredDecisionClient()
    await expect(
      dispatchAutotaggerClassifier(input, { createClient: fake.createClient }),
    ).rejects.toThrow(/already in progress/)
    expect(fake.decide).not.toHaveBeenCalled()
  })

  it('recovers a decision persisted before a crash without re-dispatching, then completes the receipt', async () => {
    const { subject, state, candidates, topics } = await buildDispatchFixture(1)
    const topic = topics[0]!
    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_SLUG)
    if (!configuration) throw new Error('tagging classifier configuration not seeded')
    const input: AutotaggerClassifierDispatchInput = {
      subject,
      state,
      candidates,
      maxCandidates: candidates.length,
    }
    const { bindings, digest } = await buildAutotaggerClassifierBindingsAndDigest(
      configuration,
      input,
    )

    const claimed = await claimAutotaggerReceipt({
      subject,
      digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
      digest,
      leaseSeconds: 60,
    })
    if (claimed.kind !== 'claimed') throw new Error('expected to claim the receipt')

    // Simulate a process crash: the decision was durably persisted (e.g. the provider call and its
    // persistence both succeeded) but the process died before completing the receipt or applying
    // votes, so the lease is left to expire.
    await persistClassifierDecision({
      batchId: claimed.batchId,
      classifierId: configuration.classifierId,
      promptVersionId: configuration.promptVersionId,
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      subject,
      calls: [
        {
          shardOrdinal: 0,
          results: bindings.map(binding => ({
            candidateKind: 'topic' as const,
            topicId: binding.candidate.topicId,
            storedCandidateId: binding.candidate.storedCandidateId,
            probability: 0.95,
            rawResponse: { simulated: 'pre-crash decision' },
          })),
        },
      ],
    })
    await expireAutotaggerReceiptLease(claimed.receiptId)

    const fake = createFakeStructuredDecisionClient()
    const result = await dispatchAutotaggerClassifier(input, { createClient: fake.createClient })

    expect(fake.decide).not.toHaveBeenCalled()
    expectSameTopicIds(result?.topicIds, [topic.id])

    const attempts = await listAutotaggerReceiptAttempts(claimed.receiptId)
    expect(attempts.map(attempt => attempt.outcome)).toEqual(['expired', null])
    expect(attempts[1]?.completed_at).not.toBeNull()
  })

  it('builds the structured-decision client with the C6 billing hooks wired (issue #616)', async () => {
    const { subject, state, candidates, topics } = await buildDispatchFixture(1)
    const topic = topics[0]!
    const fake = createFakeStructuredDecisionClient({ [topic.id]: 0.95 })

    await dispatchAutotaggerClassifier(
      { subject, state, candidates, maxCandidates: candidates.length },
      { createClient: fake.createClient },
    )

    expect(fake.createClient).toHaveBeenCalledOnce()
    const options = fake.createClient.mock.calls[0]?.[0]
    expect(options?.hooks?.beforeAttempt).toBeTypeOf('function')
    expect(options?.hooks?.onBilledResponse).toBeTypeOf('function')
    expect(options?.hooks?.onUnknownBilledAttempt).toBeTypeOf('function')
  })
})
