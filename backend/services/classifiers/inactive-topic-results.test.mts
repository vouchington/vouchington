import { softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { restoreTopicAfterClassifierDecision } from '@voucha/test-helpers/topic-merge-classifiers'
import { runClassifierBorrowedTestTransaction } from '@voucha/test-helpers/data-stores/psql/classifier-borrowed-transactions'
import { reserveClassifierDecisionBatch } from './write-decision-lineage.mts'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { getTopicByAny } from '../topics/get.mts'
import { mergeTopicAliases } from '../topics/merge-aliases.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import { ClassifierDecisionReuseError, type PersistClassifierDecisionInput } from './types.mts'

describe('delayed topic classifier decisions', () => {
  it.each([false, true])(
    'skips a merged topic and replays when all results are obsolete=%s',
    async allObsolete => {
      const fixture = await createClassifierFixture()
      await fixture.activateClassifierConfigurations()
      const admin = await createTestUser({ administrator: true })
      const destination = await createTestTopic({ user: admin })
      const batchId = uuidv7()
      const input: PersistClassifierDecisionInput = {
        batchId,
        classifierId: fixture.classifierId,
        promptVersionId: fixture.promptVersionId,
        subject: { postId: fixture.postId, rssFeedItemId: null },
        scope: { scopeCategory: 'global', scopeCommunityId: null },
        calls: [
          {
            shardOrdinal: 0,
            results: [fixture.topicId, ...(allObsolete ? [] : [destination.id])].map(topicId => ({
              candidateKind: 'topic',
              topicId,
              storedCandidateId: null,
              probability: 0.9,
              rawResponse: { probability: 0.9 },
            })),
          },
        ],
      }
      await mergeTopicAliases(
        admin,
        (await getTopicByAny(fixture.topicId))!,
        (await getTopicByAny(destination.id))!,
      )
      const first = await persistClassifierDecision(input)
      expect(first.decision.calls).toHaveLength(1)
      expect(
        first.decision.results.map(result =>
          result.candidateKind === 'topic' ? result.topicId : null,
        ),
      ).toEqual(allObsolete ? [] : [destination.id])
      await expect(persistClassifierDecision(input)).resolves.toMatchObject({
        replayed: true,
        decision: first.decision,
      })
      await expect(
        persistClassifierDecision({
          ...input,
          calls: [
            {
              ...input.calls[0]!,
              results: input.calls[0]!.results.map(result =>
                result.candidateKind === 'topic' && result.topicId === fixture.topicId
                  ? { ...result, rawResponse: { probability: 0.9, changed: true } }
                  : result,
              ),
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ClassifierDecisionReuseError)
      await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
        batches: 1,
        calls: 1,
        topic_results: allObsolete ? 0 : 1,
      })
    },
  )
  it.each(['probability', 'raw response'] as const)(
    'rejects a changed merged-topic %s when reusing a completed batch ID',
    async mutation => {
      const fixture = await createClassifierFixture()
      await fixture.activateClassifierConfigurations()
      const admin = await createTestUser({ administrator: true })
      const destination = await createTestTopic({ user: admin })
      const batchId = uuidv7()
      const input: PersistClassifierDecisionInput = {
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
                storedCandidateId: null,
                probability: 0.9,
                rawResponse: { probability: 0.9 },
              },
            ],
          },
        ],
      }
      await persistClassifierDecision(input)
      await mergeTopicAliases(
        admin,
        (await getTopicByAny(fixture.topicId))!,
        (await getTopicByAny(destination.id))!,
      )

      await expect(persistClassifierDecision(input)).resolves.toMatchObject({ replayed: true })
      const changedResult = {
        ...input.calls[0]!.results[0]!,
        ...(mutation === 'probability' ? { probability: 0.1 } : {}),
        ...(mutation === 'raw response'
          ? { rawResponse: { probability: 0.9, changed: true } }
          : {}),
      }
      await expect(
        persistClassifierDecision({
          ...input,
          calls: [
            {
              ...input.calls[0]!,
              results: [changedResult],
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ClassifierDecisionReuseError)
    },
  )
  it('rejects changed shard placement for merged-topic results', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const admin = await createTestUser({ administrator: true })
    const destination = await createTestTopic({ user: admin })
    const otherSource = await createTestTopic({ user: admin })
    const batchId = uuidv7()
    const input: PersistClassifierDecisionInput = {
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
              storedCandidateId: null,
              probability: 0.9,
              rawResponse: { probability: 0.9 },
            },
          ],
        },
        {
          shardOrdinal: 1,
          results: [
            {
              candidateKind: 'topic',
              topicId: otherSource.id,
              storedCandidateId: null,
              probability: 0.8,
              rawResponse: { probability: 0.8 },
            },
          ],
        },
      ],
    }
    await persistClassifierDecision(input)
    await mergeTopicAliases(
      admin,
      (await getTopicByAny(fixture.topicId))!,
      (await getTopicByAny(destination.id))!,
    )
    await mergeTopicAliases(
      admin,
      (await getTopicByAny(otherSource.id))!,
      (await getTopicByAny(destination.id))!,
    )

    await expect(persistClassifierDecision(input)).resolves.toMatchObject({ replayed: true })
    await expect(
      persistClassifierDecision({
        ...input,
        calls: [
          { ...input.calls[0]!, results: input.calls[1]!.results },
          { ...input.calls[1]!, results: input.calls[0]!.results },
        ],
      }),
    ).rejects.toBeInstanceOf(ClassifierDecisionReuseError)
  })
  it('completes a reserved stored-candidate answer after that candidate is removed by a merge', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const admin = await createTestUser({ administrator: true })
    const destination = await createTestTopic({ user: admin })
    const batchId = uuidv7()
    const identity = {
      batchId,
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null },
      scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
    }
    await runClassifierBorrowedTestTransaction(
      query =>
        reserveClassifierDecisionBatch(query, {
          ...identity,
          candidateKind: 'topic',
          storedCandidateIds: [fixture.topicCandidateId],
        }),
      { commit: true },
    )
    await mergeTopicAliases(
      admin,
      (await getTopicByAny(fixture.topicId))!,
      (await getTopicByAny(destination.id))!,
    )
    const input: PersistClassifierDecisionInput = {
      ...identity,
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'topic',
              topicId: fixture.topicId,
              storedCandidateId: fixture.topicCandidateId,
              probability: 0.9,
              rawResponse: { probability: 0.9 },
            },
          ],
        },
      ],
    }
    await expect(persistClassifierDecision(input)).resolves.toMatchObject({
      replayed: false,
      decision: { results: [] },
    })
    await expect(persistClassifierDecision(input)).resolves.toMatchObject({
      replayed: true,
      decision: { results: [] },
    })
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 1,
      calls: 1,
      snapshots: 0,
      topic_results: 0,
    })
  })
  it('retains replay lineage for a deleted topic that can later be restored', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const admin = await createTestUser({ administrator: true })
    await softDeleteTopic(fixture.topicId, admin.id)
    const input: PersistClassifierDecisionInput = {
      batchId: uuidv7(),
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
              storedCandidateId: null,
              probability: 0.9,
              rawResponse: { probability: 0.9 },
            },
          ],
        },
      ],
    }
    const first = await persistClassifierDecision(input)
    expect(first.decision.results).toHaveLength(1)
    await restoreTopicAfterClassifierDecision(fixture.topicId)
    await expect(persistClassifierDecision(input)).resolves.toMatchObject({
      replayed: true,
      decision: first.decision,
    })
  })
})
