import { randomUUID } from 'node:crypto'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import {
  getPostClassifierApplicationFacts,
  setPostClassifierPostHashForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { getClassifierBorrowedDecisionFacts } from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import type { PersistClassifierDecisionInput } from '@services/classifiers/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { persistPostClassifierOutcomes } from './application-outcomes.mts'
import { completePostClassifierApplication } from './application-completion.mts'
import { claimPostClassifierApplication } from './application-claim.mts'
import { applyPostClassifierVotes } from './application-votes.mts'
import {
  failPostClassifierRemoteAttempt,
  startPostClassifierProviderAttempt,
} from './application-attempt.mts'

type Fixture = Awaited<ReturnType<typeof createPostClassifierExecutionFixture>>

function remoteDecision(fixture: Fixture): PersistClassifierDecisionInput {
  const remote = fixture.lease.resolved.configuration.remote!
  const question = remote.questions[0]!
  return {
    batchId: fixture.lease.decisionBatchId!,
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: { postId: fixture.post.id, rssFeedItemId: null },
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'topic',
            topicId: question.topicId,
            storedCandidateId: question.candidateId,
            probability: 0.9,
            rawResponse: { type: 'noul', probability: 0.9 },
          },
        ],
      },
    ],
  }
}

function localOutcome(fixture: Fixture) {
  return {
    flagged: false,
    reason: 'Human-written',
    confidenceScore: 0.1,
    confidenceThreshold: fixture.lease.resolved.configuration.local!.confidenceThreshold,
    classification: 'human' as const,
    detector: 'test-detector',
    detectorModelVersion: 'test-model',
  }
}

async function expectNoEffects(fixture: Fixture) {
  await expect(getPostClassifierApplicationFacts(fixture.post.id)).resolves.toMatchObject([
    {
      provider_attempts_started: 0,
      outcomes_persisted_at: null,
      votes_applied_at: null,
      tags_applied_at: null,
      completed_at: null,
      lease_token: fixture.lease.leaseToken,
    },
  ])
}

describe('post classifier rejected effects leave durable state unchanged', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it.each([0, -1, 1.5])(
    'rejects invalid lease duration %s without replacing the claimant',
    async leaseSeconds => {
      const fixture = await createPostClassifierExecutionFixture(true, false)
      await expect(
        claimPostClassifierApplication({ ...fixture.lease, leaseSeconds }),
      ).rejects.toThrow('lease duration must be a positive integer')
      await expectNoEffects(fixture)
    },
  )

  it('rejects voting when the current post content no longer matches the receipt', async () => {
    const fixture = await createPostClassifierExecutionFixture(true, false)
    await setPostClassifierPostHashForTest(fixture.post.id, Buffer.alloc(32, 7))
    await expect(applyPostClassifierVotes(fixture.lease)).rejects.toThrow(
      'became stale before vote application',
    )
    await expectNoEffects(fixture)
  })

  it('rejects completion and voting before outcomes exist', async () => {
    const fixture = await createPostClassifierExecutionFixture(true, false)
    await expect(completePostClassifierApplication(fixture.lease)).rejects.toThrow(
      'outcomes must persist before completion',
    )
    await expect(applyPostClassifierVotes(fixture.lease)).rejects.toThrow(
      'outcomes must persist before votes',
    )
    await expectNoEffects(fixture)
  })

  it('rejects a foreign lease token without changing the current claimant', async () => {
    const fixture = await createPostClassifierExecutionFixture(true, false)
    const foreignLease = { ...fixture.lease, leaseToken: randomUUID() }
    await expect(applyPostClassifierVotes(foreignLease)).rejects.toThrow('lease is not current')
    await expect(completePostClassifierApplication(foreignLease)).resolves.toMatchObject({
      kind: 'stale',
    })
    await expectNoEffects(fixture)
  })

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid attempt limit %s before mutation',
    async maxAttempts => {
      const fixture = await createPostClassifierExecutionFixture(true, false)
      await expect(
        startPostClassifierProviderAttempt({ ...fixture.lease, maxAttempts }),
      ).rejects.toThrow('attempt limit must be positive')
      await expect(
        failPostClassifierRemoteAttempt({
          ...fixture.lease,
          maxAttempts,
          failureKind: 'provider-error',
        }),
      ).rejects.toThrow('attempt limit must be positive')
      await expectNoEffects(fixture)
    },
  )

  it('requires the complete remote result and exact subject identity', async () => {
    const fixture = await createPostClassifierExecutionFixture(true, false)
    await expect(persistPostClassifierOutcomes({ lease: fixture.lease })).rejects.toThrow(
      'requires a complete remote output',
    )
    const decision = remoteDecision(fixture)
    await expect(
      persistPostClassifierOutcomes({
        lease: fixture.lease,
        remoteDecision: { ...decision, subject: { postId: randomUUID(), rssFeedItemId: null } },
      }),
    ).rejects.toThrow('remote input does not match its receipt')
    await expect(
      persistPostClassifierOutcomes({
        lease: fixture.lease,
        remoteDecision: { ...decision, calls: [] },
      }),
    ).rejects.toThrow('does not cover its exact configured candidates')
    await expectNoEffects(fixture)
    await expect(
      getClassifierBorrowedDecisionFacts(fixture.lease.decisionBatchId!),
    ).resolves.toMatchObject({ calls: 0, topicResults: 0 })
  })

  it('rejects a local outcome when only remote classification is configured', async () => {
    const fixture = await createPostClassifierExecutionFixture(true, false)
    await expect(
      persistPostClassifierOutcomes({
        lease: fixture.lease,
        remoteDecision: remoteDecision(fixture),
        localOutcome: {
          flagged: false,
          reason: 'Human-written',
          confidenceScore: 0.1,
          confidenceThreshold: 0.95,
          classification: 'human',
          detector: 'test-detector',
          detectorModelVersion: 'test-model',
        },
      }),
    ).rejects.toThrow('local outcome is not enabled')
    await expectNoEffects(fixture)
  })

  it('rejects malformed local outcomes and unexpected remote output on a local-only receipt', async () => {
    const fixture = await createPostClassifierExecutionFixture(false, true)
    const valid = localOutcome(fixture)
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
        persistPostClassifierOutcomes({ lease: fixture.lease, localOutcome: invalid }),
      ).rejects.toThrow('local outcome does not match')
    }
    const other = await createPostClassifierExecutionFixture(true, false)
    await expect(
      persistPostClassifierOutcomes({
        lease: fixture.lease,
        localOutcome: valid,
        remoteDecision: remoteDecision(other),
      }),
    ).rejects.toThrow('Local-only classifier application cannot persist remote output')
    await expectNoEffects(fixture)
    await expectNoEffects(other)
  })
})
