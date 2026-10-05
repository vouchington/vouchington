import { randomUUID } from 'node:crypto'
import { getClassifierBorrowedDecisionFacts } from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import { readSubjectTopicRelationFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
  type PostClassifierExecutionFixture,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  localOutcomeFor,
  makePostClassifierLocalOutcome,
  remoteDecisionFor,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTopicElectionVote } from '@services/elections-votes/topic'
import {
  completeClassifierRun,
  persistClassifierRunOutcomes,
  readClassifierRunOutcomes,
  startClassifierProviderAttempt,
  type TopicRemotePlan,
} from '@services/classifier-runs'

const facts = async (setup: PostClassifierExecutionFixture) =>
  (await getClassifierRunFacts(setup.post.id, POST_CLASSIFIER_SLUG))[0]!

async function expectNoOutcomes(setup: PostClassifierExecutionFixture) {
  expect(await facts(setup)).toMatchObject({
    provider_attempts_started: 0,
    outcomes_persisted_at: null,
    completed_at: null,
    lease_token: setup.lease.leaseToken,
  })
}

describe('post classifier outcomes on the shared lifecycle (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('persists a local-only outcome without a provider attempt or decision batch', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)
    const local = localOutcomeFor(setup, true)!
    expect(
      await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 }),
    ).toBe('no_remote')
    await expect(
      persistClassifierRunOutcomes(setup.adapter, { lease: setup.lease }),
    ).rejects.toThrow('local outcome is required')

    expect(await persistClassifierRunOutcomes(setup.adapter, { lease: setup.lease, local })).toBe(
      'persisted',
    )

    expect(await readClassifierRunOutcomes(setup.adapter, setup.lease)).toEqual({
      local,
      remoteDecision: null,
    })
    expect(await facts(setup)).toMatchObject({
      decision_batch_id: null,
      provider_attempts_started: 0,
    })
    expect(await completeClassifierRun(setup.adapter, setup.lease)).toMatchObject({
      kind: 'completed',
    })
  })

  it('persists and recovers a remote-only run without a local outcome', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const question = setup.lease.resolved.configuration.remote!.questions[0]!
    expect(setup.lease.resolved.configuration.local).toBeNull()
    await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 })

    expect(
      await persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        remoteDecision: remoteDecisionFor(setup, true),
      }),
    ).toBe('persisted')

    expect(await readClassifierRunOutcomes(setup.adapter, setup.lease)).toMatchObject({
      local: null,
      remoteDecision: { batchId: setup.lease.decisionBatchId },
    })
    expect(await completeClassifierRun(setup.adapter, setup.lease)).toMatchObject({
      kind: 'completed',
      effects: { addedTopicIds: [question.topicId] },
    })
  })

  it('binds exact C3 lineage and the local outcome, then casts exactly one relation vote', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    const question = setup.lease.resolved.configuration.remote!.questions[0]!
    await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 })

    expect(
      await persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        remoteDecision: remoteDecisionFor(setup, true),
        local: localOutcomeFor(setup, true),
      }),
    ).toBe('persisted')

    const recovered = await readClassifierRunOutcomes(setup.adapter, setup.lease)
    expect(recovered?.remoteDecision?.results[0]).toMatchObject({
      topicId: question.topicId,
      thresholdId: question.thresholdId,
      effectiveThresholds: { lower: question.lower, upper: question.upper },
    })
    expect(
      await startClassifierProviderAttempt(setup.adapter, { lease: setup.lease, maxAttempts: 3 }),
    ).toBe('replay')
    const actorId = setup.lease.resolved.actorId
    const subject = { postId: setup.post.id, rssFeedItemId: null } as const
    const actorVotesOnRelation = async () =>
      (await readSubjectTopicRelationFacts(subject))
        .filter(relation => relation.topicId === question.topicId)
        .flatMap(relation => relation.votes.filter(vote => vote.userId === actorId))
    expect(await actorVotesOnRelation()).toEqual([])

    await completeClassifierRun(setup.adapter, setup.lease)
    expect(await completeClassifierRun(setup.adapter, setup.lease)).toEqual({ kind: 'replay' })

    expect(await actorVotesOnRelation()).toEqual([{ userId: actorId, score: 1 }])
    await expect(getTopicElectionVote(actorId, question.topicId)).resolves.toBeNull()
  })

  it('rejects poisoned remote candidate lineage without retaining a partial result', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    const decision = remoteDecisionFor(setup, true)!

    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        local: localOutcomeFor(setup, true),
        remoteDecision: {
          ...decision,
          calls: [
            {
              ...decision.calls[0]!,
              results: [
                {
                  ...decision.calls[0]!.results[0]!,
                  candidateKind: 'topic' as const,
                  topicId: setup.post.id,
                },
              ],
            },
          ],
        },
      }),
    ).rejects.toThrow('lineage')

    expect((await getClassifierBorrowedDecisionFacts(setup.lease.decisionBatchId!)).batches).toBe(1)
    await expectNoOutcomes(setup)
  })

  it('rejects a threshold that differs from the immutable receipt snapshot', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    const remote = setup.lease.resolved.remote as TopicRemotePlan
    const poisoned = {
      ...setup.lease,
      resolved: {
        ...setup.lease.resolved,
        remote: {
          ...remote,
          candidates: remote.candidates.map(candidate => ({
            ...candidate,
            lower: candidate.lower + 0.01,
          })),
        },
      },
    }

    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease: poisoned,
        remoteDecision: remoteDecisionFor(setup, true),
        local: localOutcomeFor(setup, true),
      }),
    ).rejects.toThrow('lineage')
    await expectNoOutcomes(setup)
  })

  it('requires the complete remote result and the exact subject identity', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const decision = remoteDecisionFor(setup, true)!

    await expect(
      persistClassifierRunOutcomes(setup.adapter, { lease: setup.lease }),
    ).rejects.toThrow('requires a complete remote output')
    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        remoteDecision: { ...decision, subject: { postId: randomUUID(), rssFeedItemId: null } },
      }),
    ).rejects.toThrow('remote input does not match its receipt')
    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        remoteDecision: { ...decision, calls: [] },
      }),
    ).rejects.toThrow('does not cover its exact reserved candidates')

    await expectNoOutcomes(setup)
    expect(await getClassifierBorrowedDecisionFacts(setup.lease.decisionBatchId!)).toMatchObject({
      calls: 0,
      topicResults: 0,
    })
  })

  it('rejects a local outcome when only remote classification is configured', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)

    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        remoteDecision: remoteDecisionFor(setup, true),
        local: makePostClassifierLocalOutcome(false, 0.95),
      }),
    ).rejects.toThrow('local outcome is not enabled')
    await expectNoOutcomes(setup)
  })

  it('rejects malformed local outcomes and remote output on a local-only run', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)
    const valid = localOutcomeFor(setup, false)!
    for (const invalid of [
      { ...valid, confidenceScore: Number.NaN },
      { ...valid, confidenceScore: -0.1 },
      { ...valid, confidenceScore: 1.1 },
      { ...valid, confidenceThreshold: valid.confidenceThreshold / 2 },
      { ...valid, reason: '' },
      { ...valid, detector: '' },
      { ...valid, detectorModelVersion: '' },
    ]) {
      await expect(
        persistClassifierRunOutcomes(setup.adapter, { lease: setup.lease, local: invalid }),
      ).rejects.toThrow('local outcome does not match')
    }
    const other = await createPostClassifierExecutionFixture(true, false)

    await expect(
      persistClassifierRunOutcomes(setup.adapter, {
        lease: setup.lease,
        local: valid,
        remoteDecision: remoteDecisionFor(other, true),
      }),
    ).rejects.toThrow('cannot persist remote output')
    await expectNoOutcomes(setup)
  })

  it('rejects a foreign lease token without changing the current claimant', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const foreign = { ...setup.lease, leaseToken: randomUUID() }

    expect(
      await persistClassifierRunOutcomes(setup.adapter, {
        lease: foreign,
        remoteDecision: remoteDecisionFor(setup, true),
      }),
    ).toBe('stale')
    expect(await completeClassifierRun(setup.adapter, foreign)).toEqual({ kind: 'stale' })
    await expectNoOutcomes(setup)
  })
})
