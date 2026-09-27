import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import generateSeedPostClassifierSQL from '@data-stores/psql/config-driven/0635-00-03-seed-post-classifier'
import { createPostModerationContent } from '@services/posts/content'
import { createTestPost, createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { acquirePostClassifierSeedTestLock } from '@voucha/test-helpers/data-stores/psql/post-classifier/seed-lock'
import {
  getClassifierBorrowedDecisionFacts,
  getClassifierBorrowedVoteFacts,
  runClassifierBorrowedTestTransaction,
} from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import {
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { moderationConfig } from '@services/moderation/config'
import { claimPostClassifierApplication } from './application-claim.mts'
import { startPostClassifierProviderAttempt } from './application-attempt.mts'
import {
  persistPostClassifierOutcomes,
  persistPostClassifierOutcomesWithQuery,
} from './application-outcomes.mts'
import { readPostClassifierOutcomes } from './application-read.mts'
import { applyPostClassifierVotes } from './application-votes.mts'
import { resolvePostClassifierConfiguration } from './configuration.mts'

const detectorPackageVersion = 'test-package-0.4.3'
function makeLocalOutcome(confidenceThreshold: number) {
  return {
    flagged: true,
    reason: 'AI-generated',
    confidenceScore: 0.98,
    confidenceThreshold,
    classification: 'ai' as const,
    detector: 'test-detector',
    detectorModelVersion: 'test-model',
  }
}

async function fixture(remote: boolean, local = true) {
  const actor = await createTestUser()
  const community = remote ? await insertTestCommunity({ createdById: actor.id }) : null
  if (community) await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
  if (community && !local) await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
  const post = await createTestPost({ user: actor, community_id: community?.id })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await setPostClassifierPostHashForTest(post.id, inputSha256)
  const resolved = await resolvePostClassifierConfiguration(community?.id ?? null, {
    detectorPackageVersion,
  })
  if (!resolved) throw new Error('Classifier configuration missing')
  const claim = await claimPostClassifierApplication({
    postId: post.id,
    inputSha256,
    resolved,
    detectorPackageVersion,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
  const question = resolved.configuration.remote?.questions[0]
  const remoteDecision = question
    ? {
        batchId: claim.decisionBatchId!,
        classifierId: resolved.configuration.remote!.classifierId,
        promptVersionId: resolved.configuration.remote!.promptVersionId,
        scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
        subject: { postId: post.id, rssFeedItemId: null },
        calls: [
          {
            shardOrdinal: 0,
            results: [
              {
                candidateKind: 'topic' as const,
                topicId: question.topicId,
                storedCandidateId: question.candidateId,
                probability: 0.9,
                rawResponse: { type: 'noul', probability: 0.9 },
              },
            ],
          },
        ],
      }
    : null
  return {
    claim,
    post,
    resolved,
    remoteDecision,
    question,
    localOutcome: claim.resolved.configuration.local
      ? makeLocalOutcome(claim.resolved.configuration.local.confidenceThreshold)
      : null,
  }
}

describe('post classifier outcome and vote receipts (real PG)', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined
  beforeAll(async () => {
    releaseSeedLock = (await acquirePostClassifierSeedTestLock()).release
    await moderationConfig.waitForInitialization()
    await runConfigDrivenStatementsInTransaction(generateSeedPostClassifierSQL(), undefined)
  })
  afterAll(async () => releaseSeedLock?.())

  it('persists local-only typed outcome without a provider attempt or C3 batch', async () => {
    const setup = await fixture(false)
    expect(await startPostClassifierProviderAttempt({ ...setup.claim, maxAttempts: 3 })).toBe(
      'no_remote',
    )
    await expect(persistPostClassifierOutcomes({ lease: setup.claim })).rejects.toThrow(
      'local outcome is required',
    )
    expect(
      await persistPostClassifierOutcomes({
        lease: setup.claim,
        localOutcome: setup.localOutcome!,
      }),
    ).toBe('persisted')
    const recovered = await readPostClassifierOutcomes(setup.claim)
    expect(recovered?.localOutcome).toEqual(setup.localOutcome)
    expect(recovered?.remoteDecision).toBeNull()
    expect(await getPostClassifierApplicationFacts(setup.post.id)).toMatchObject([
      { decision_batch_id: null, provider_attempts_started: 0, local_flagged: true },
    ])
    expect(await applyPostClassifierVotes(setup.claim)).toEqual({ appliedTopicIds: [] })
    expect(
      (await getPostClassifierApplicationFacts(setup.post.id))[0]?.votes_applied_at,
    ).not.toBeNull()
  })
  it('persists and recovers a remote-only receipt without a local detector outcome', async () => {
    const setup = await fixture(true, false)
    expect(setup.claim.resolved.configuration.local).toBeNull()
    expect(await startPostClassifierProviderAttempt({ ...setup.claim, maxAttempts: 3 })).toBe(
      'started',
    )
    expect(
      await persistPostClassifierOutcomes({
        lease: setup.claim,
        remoteDecision: setup.remoteDecision!,
      }),
    ).toBe('persisted')
    expect(await readPostClassifierOutcomes(setup.claim)).toMatchObject({
      localOutcome: null,
      remoteDecision: { batchId: setup.claim.decisionBatchId },
    })
    expect(await applyPostClassifierVotes(setup.claim)).toEqual({
      appliedTopicIds: [setup.question!.topicId],
    })
  })
  it('atomically binds exact C3 lineage and local outcome, then applies C4 vote and phase', async () => {
    const setup = await fixture(true)
    expect(await startPostClassifierProviderAttempt({ ...setup.claim, maxAttempts: 3 })).toBe(
      'started',
    )
    expect(
      await persistPostClassifierOutcomes({
        lease: setup.claim,
        remoteDecision: setup.remoteDecision!,
        localOutcome: setup.localOutcome!,
      }),
    ).toBe('persisted')
    const recovered = await readPostClassifierOutcomes(setup.claim)
    expect(recovered?.remoteDecision?.results[0]).toMatchObject({
      topicId: setup.question!.topicId,
      thresholdId: setup.question!.thresholdId,
      effectiveThresholds: { lower: setup.question!.lower, upper: setup.question!.upper },
    })
    expect(await startPostClassifierProviderAttempt({ ...setup.claim, maxAttempts: 3 })).toBe(
      'replay',
    )
    expect(await applyPostClassifierVotes(setup.claim)).toEqual({
      appliedTopicIds: [setup.question!.topicId],
    })
    expect(
      await getClassifierBorrowedVoteFacts(
        setup.claim.decisionBatchId!,
        setup.resolved.configuration.actorId,
        setup.question!.topicId,
      ),
    ).toMatchObject({ receipts: 1, votes: 1 })
    expect(
      (await getPostClassifierApplicationFacts(setup.post.id))[0]?.votes_applied_at,
    ).not.toBeNull()
  })
  it('rejects poisoned remote candidate lineage without retaining a partial result', async () => {
    const setup = await fixture(true)
    await expect(
      persistPostClassifierOutcomes({
        lease: setup.claim,
        remoteDecision: {
          ...setup.remoteDecision!,
          calls: [
            {
              ...setup.remoteDecision!.calls[0]!,
              results: [
                {
                  ...setup.remoteDecision!.calls[0]!.results[0]!,
                  probability: 0.9,
                  topicId: setup.post.id,
                },
              ],
            },
          ],
        },
        localOutcome: setup.localOutcome!,
      }),
    ).rejects.toThrow('lineage')
    expect((await getClassifierBorrowedDecisionFacts(setup.claim.decisionBatchId!)).batches).toBe(1)
  })
  it('rejects a persisted threshold that differs from the immutable receipt snapshot', async () => {
    const setup = await fixture(true)
    const remote = setup.claim.resolved.configuration.remote!
    const poisonedLease = {
      ...setup.claim,
      resolved: {
        ...setup.claim.resolved,
        configuration: {
          ...setup.claim.resolved.configuration,
          remote: {
            ...remote,
            questions: remote.questions.map(question => ({
              ...question,
              lower: question.lower + 0.01,
            })),
          },
        },
      },
    }
    await expect(
      persistPostClassifierOutcomes({
        lease: poisonedLease,
        remoteDecision: setup.remoteDecision!,
        localOutcome: setup.localOutcome!,
      }),
    ).rejects.toThrow('lineage')
    expect((await getClassifierBorrowedDecisionFacts(setup.claim.decisionBatchId!)).batches).toBe(1)
  })
  it('keeps C3, the receipt, C4 votes, and phase inside one borrowed transaction', async () => {
    const setup = await fixture(true)
    await expect(
      runClassifierBorrowedTestTransaction(async query => {
        expect(
          await persistPostClassifierOutcomesWithQuery(query, {
            lease: setup.claim,
            remoteDecision: setup.remoteDecision!,
            localOutcome: setup.localOutcome!,
          }),
        ).toBe('persisted')
        await applyPostClassifierVotes(setup.claim, { query })
        throw new Error('later borrowed effect failed')
      }),
    ).rejects.toThrow('later borrowed effect failed')
    expect(await getClassifierBorrowedDecisionFacts(setup.claim.decisionBatchId!)).toMatchObject({
      batches: 1,
      calls: 0,
      snapshots: 1,
      topicResults: 0,
    })
    expect((await getPostClassifierApplicationFacts(setup.post.id))[0]).toMatchObject({
      decision_batch_id: setup.claim.decisionBatchId,
      outcomes_persisted_at: null,
      votes_applied_at: null,
    })
    await runClassifierBorrowedTestTransaction(
      async query => {
        await persistPostClassifierOutcomesWithQuery(query, {
          lease: setup.claim,
          remoteDecision: setup.remoteDecision!,
          localOutcome: setup.localOutcome!,
        })
        await applyPostClassifierVotes(setup.claim, { query })
      },
      { commit: true },
    )
    expect((await getPostClassifierApplicationFacts(setup.post.id))[0]).toMatchObject({
      decision_batch_id: setup.claim.decisionBatchId,
      votes_applied_at: expect.any(Date),
    })
  })
})
