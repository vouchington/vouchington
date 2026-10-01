import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { runClassifierBorrowedTestTransaction } from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import {
  readCompleteClassifierDecision,
  readCompleteClassifierDecisionIfExistsFromPrimary,
} from './read-complete-decision.mts'
import { reserveClassifierDecisionBatch } from './write-decision-lineage.mts'

describe('reserved classifier decisions', () => {
  it('completes the exact empty batch and threshold snapshots reserved before provider execution', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()
    expect(
      await runClassifierBorrowedTestTransaction(
        query =>
          reserveClassifierDecisionBatch(query, {
            batchId,
            classifierId: fixture.classifierId,
            promptVersionId: fixture.promptVersionId,
            subject: { postId: fixture.postId, rssFeedItemId: null },
            scope: { scopeCategory: 'global', scopeCommunityId: null },
            candidateKind: 'topic',
            storedCandidateIds: [fixture.topicCandidateId],
          }),
        { commit: true },
      ),
    ).toBe(true)

    await expect(
      readCompleteClassifierDecisionIfExistsFromPrimary(batchId, 'topic'),
    ).resolves.toBeNull()
    await expect(
      runClassifierBorrowedTestTransaction(query =>
        readCompleteClassifierDecision(query, batchId, 'topic'),
      ),
    ).rejects.toThrow('reserved but not complete')
    const persisted = await persistClassifierDecision({
      batchId,
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null },
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'topic',
              topicId: fixture.topicId,
              storedCandidateId: fixture.topicCandidateId,
              probability: 0.8,
              rawResponse: { type: 'noul', probability: 0.8 },
            },
          ],
        },
      ],
    })

    expect(persisted).toMatchObject({ replayed: false, decision: { batchId } })
    await expect(
      readCompleteClassifierDecisionIfExistsFromPrimary(batchId, 'topic'),
    ).resolves.toMatchObject({
      batchId,
      results: [expect.objectContaining({ storedCandidateId: fixture.topicCandidateId })],
    })
  })

  it('rejects a changed candidate set without persisting calls or results', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = await reserveTopicBatch(fixture)

    await expect(
      persistClassifierDecision(topicInput(fixture, batchId, null)),
    ).rejects.toMatchObject({
      code: 'input',
    })
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 1,
      calls: 0,
      snapshots: 1,
      topic_results: 0,
    })
  })

  it('rejects invalid reservations before they can create uncompletable lineage', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const invalidVersionBatchId = randomUUID()
    const duplicateCandidateBatchId = uuidv7()
    const storyOnPostBatchId = uuidv7()

    const invalidVersionMessage = await expectReservationFailure(
      fixture,
      invalidVersionBatchId,
      reservation => ({
        ...reservation,
        batchId: invalidVersionBatchId,
      }),
    )
    const duplicateCandidateMessage = await expectReservationFailure(
      fixture,
      duplicateCandidateBatchId,
      reservation => ({
        ...reservation,
        batchId: duplicateCandidateBatchId,
        storedCandidateIds: [fixture.topicCandidateId, fixture.topicCandidateId],
      }),
    )
    const storyOnPostMessage = await expectStoryReservationFailure(fixture, storyOnPostBatchId)

    expect([invalidVersionMessage, duplicateCandidateMessage, storyOnPostMessage]).toEqual([
      'Classifier decision batch ID must be UUIDv7',
      'Classifier decision stored candidate IDs must be unique UUIDs',
      'Classifier candidate kind does not match its decision subject',
    ])
  })

  it('completes with its captured threshold after the active revision is replaced', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()
    await runClassifierBorrowedTestTransaction(
      query =>
        reserveClassifierDecisionBatch(query, {
          batchId,
          classifierId: fixture.classifierId,
          promptVersionId: fixture.promptVersionId,
          subject: { postId: fixture.postId, rssFeedItemId: null },
          scope: { scopeCategory: 'community_ai', scopeCommunityId: fixture.communityId },
          candidateKind: 'topic',
          storedCandidateIds: [fixture.communityCandidateId],
        }),
      { commit: true },
    )
    await fixture.deactivateCommunityThreshold()
    await fixture.createReplacementCommunityThreshold()
    await fixture.deactivatePrompt()

    const persisted = await persistClassifierDecision({
      ...topicInput(fixture, batchId, fixture.communityCandidateId, fixture.communityTopicId),
      scope: { scopeCategory: 'community_ai', scopeCommunityId: fixture.communityId },
    })

    expect(persisted.decision.results).toEqual([
      expect.objectContaining({
        thresholdId: fixture.communityThresholdId,
        effectiveThresholds: { lower: 0.3, upper: 0.75 },
      }),
    ])
  })

  it('serializes concurrent completion of one reserved batch into one decision and one replay', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = await reserveTopicBatch(fixture)
    const input = topicInput(fixture, batchId, fixture.topicCandidateId)

    const decisions = await Promise.all([
      persistClassifierDecision(input),
      persistClassifierDecision(input),
    ])

    expect(decisions.map(decision => decision.replayed).toSorted()).toEqual([false, true])
    expect(decisions[0]?.decision).toEqual(decisions[1]?.decision)
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 1,
      calls: 1,
      snapshots: 1,
      topic_results: 1,
    })
  })
})

async function reserveTopicBatch(
  fixture: Awaited<ReturnType<typeof createClassifierFixture>>,
): Promise<string> {
  const batchId = uuidv7()
  expect(
    await runClassifierBorrowedTestTransaction(
      query =>
        reserveClassifierDecisionBatch(query, {
          batchId,
          classifierId: fixture.classifierId,
          promptVersionId: fixture.promptVersionId,
          subject: { postId: fixture.postId, rssFeedItemId: null },
          scope: { scopeCategory: 'global', scopeCommunityId: null },
          candidateKind: 'topic',
          storedCandidateIds: [fixture.topicCandidateId],
        }),
      { commit: true },
    ),
  ).toBe(true)
  return batchId
}

function topicInput(
  fixture: Awaited<ReturnType<typeof createClassifierFixture>>,
  batchId: string,
  storedCandidateId: string | null,
  topicId = fixture.topicId,
) {
  return {
    batchId,
    classifierId: fixture.classifierId,
    promptVersionId: fixture.promptVersionId,
    subject: { postId: fixture.postId, rssFeedItemId: null } as const,
    scope: { scopeCategory: 'global', scopeCommunityId: null } as const,
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'topic' as const,
            topicId,
            storedCandidateId,
            probability: 0.8,
            rawResponse: { type: 'noul', probability: 0.8 },
          },
        ],
      },
    ],
  }
}

async function expectReservationFailure(
  fixture: Awaited<ReturnType<typeof createClassifierFixture>>,
  batchId: string,
  mutate: (
    reservation: Parameters<typeof reserveClassifierDecisionBatch>[1],
  ) => Parameters<typeof reserveClassifierDecisionBatch>[1],
): Promise<string> {
  const error = await runClassifierBorrowedTestTransaction(
    query =>
      getReservationError(
        reserveClassifierDecisionBatch(
          query,
          mutate({
            batchId,
            classifierId: fixture.classifierId,
            promptVersionId: fixture.promptVersionId,
            subject: { postId: fixture.postId, rssFeedItemId: null },
            scope: { scopeCategory: 'global', scopeCommunityId: null },
            candidateKind: 'topic',
            storedCandidateIds: [fixture.topicCandidateId],
          }),
        ),
      ),
    { commit: true },
  )
  await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
    batches: 0,
    snapshots: 0,
  })
  return error.message
}

async function expectStoryReservationFailure(
  fixture: Awaited<ReturnType<typeof createClassifierFixture>>,
  batchId: string,
): Promise<string> {
  const error = await runClassifierBorrowedTestTransaction(
    query =>
      getReservationError(
        reserveClassifierDecisionBatch(query, {
          batchId,
          classifierId: fixture.storyClassifierId,
          promptVersionId: fixture.storyPromptVersionId,
          subject: { postId: fixture.postId, rssFeedItemId: null },
          scope: { scopeCategory: 'global', scopeCommunityId: null },
          candidateKind: 'story',
          storedCandidateIds: [fixture.storyCandidateId],
        }),
      ),
    { commit: true },
  )
  await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
    batches: 0,
    snapshots: 0,
  })
  return error.message
}

async function getReservationError(reservation: Promise<unknown>): Promise<Error> {
  try {
    await reservation
  } catch (err) {
    if (err instanceof Error) return err
    throw err
  }
  throw new Error('Expected classifier decision reservation to fail')
}
