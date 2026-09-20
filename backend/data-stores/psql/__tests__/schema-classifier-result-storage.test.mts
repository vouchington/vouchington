import { afterAll, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { onGracefulShutdown } from '../index.mts'

describe('classifier result storage', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('supports ordered shards while preventing duplicate candidate results across them', async () => {
    const fixture = await createClassifierFixture()
    const { batchId, callId } = await fixture.createTopicBatch()
    const secondCallId = await fixture.createAdditionalCall(batchId, 1)

    await expect(fixture.insertTopicResult({ batchId, callId })).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(
      fixture.insertTopicResult({ batchId, callId: secondCallId }),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(fixture.createAdditionalCall(batchId, 1)).rejects.toMatchObject({ code: '23505' })

    const otherBatch = await fixture.createTopicBatch()
    await expect(
      fixture.insertTopicResult({
        batchId,
        callId: otherBatch.callId,
        candidateId: null,
        topicId: fixture.communityTopicId,
      }),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('preserves provider probability precision', async () => {
    const fixture = await createClassifierFixture()
    const topicLineage = await fixture.createTopicBatch()
    const storyLineage = await fixture.createStoryBatch()

    await expect(
      fixture.insertTopicResult({ ...topicLineage, probability: 0.75004 }),
    ).resolves.toMatchObject({ rows: [{ probability: '0.75004' }] })
    await expect(
      fixture.insertStoryResult(storyLineage.batchId, storyLineage.callId, 0.75004),
    ).resolves.toMatchObject({ rows: [{ probability: '0.75004' }] })
  })

  it('persists valid story-classifier lineage in the concrete story result family', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createStoryBatch()

    await expect(fixture.insertStoryResult(lineage.batchId, lineage.callId)).resolves.toMatchObject(
      { rowCount: 1 },
    )
  })

  it('stores runtime-prefiltered candidates without materializing candidate rows', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createTopicBatch()

    await expect(
      fixture.insertTopicResult({ ...lineage, candidateId: null }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      fixture.insertTopicResult({ ...lineage, candidateId: null }),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      fixture.rejectTopicClassifierStoryResult(lineage.batchId, lineage.callId),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('applies declared ownership cascades without erasing retained configuration', async () => {
    const callFixture = await createClassifierFixture()
    const callLineage = await callFixture.createTopicBatch()
    await callFixture.insertTopicResult(callLineage)
    await callFixture.deleteCall(callLineage.callId)
    await expect(callFixture.getLineageCounts(callLineage)).resolves.toEqual({
      batches: 1,
      calls: 0,
      candidates: 1,
      results: 0,
    })

    const batchFixture = await createClassifierFixture()
    const batchLineage = await batchFixture.createTopicBatch()
    await batchFixture.insertTopicResult(batchLineage)
    await batchFixture.deleteBatch(batchLineage.batchId)
    await expect(batchFixture.getLineageCounts(batchLineage)).resolves.toEqual({
      batches: 0,
      calls: 0,
      candidates: 1,
      results: 0,
    })

    const candidateFixture = await createClassifierFixture()
    const candidateLineage = await candidateFixture.createTopicBatch()
    await candidateFixture.insertTopicResult(candidateLineage)
    await candidateFixture.deleteCandidate(candidateFixture.topicCandidateId)
    await expect(candidateFixture.getLineageCounts(candidateLineage)).resolves.toEqual({
      batches: 1,
      calls: 1,
      candidates: 0,
      results: 0,
    })

    const subjectFixture = await createClassifierFixture()
    const subjectLineage = await subjectFixture.createTopicBatch()
    await subjectFixture.insertTopicResult(subjectLineage)
    await subjectFixture.deletePost()
    await expect(subjectFixture.getLineageCounts(subjectLineage)).resolves.toEqual({
      batches: 0,
      calls: 0,
      candidates: 1,
      results: 0,
    })

    const communityFixture = await createClassifierFixture()
    const communityLineage = await communityFixture.createTopicBatch({
      communityId: communityFixture.communityId,
    })
    await communityFixture.insertTopicResult({
      ...communityLineage,
      candidateId: communityFixture.communityCandidateId,
      topicId: communityFixture.communityTopicId,
      communityId: communityFixture.communityId,
    })
    await communityFixture.deleteCommunity()
    await expect(
      communityFixture.getLineageCounts({
        ...communityLineage,
        candidateId: communityFixture.communityCandidateId,
      }),
    ).resolves.toEqual({ batches: 1, calls: 1, candidates: 0, results: 0 })
  })

  it('creates concrete default RANGE partitions for both result families', async () => {
    const fixture = await createClassifierFixture()
    const facts = await fixture.getPartitionFacts()

    expect(facts).toEqual([
      {
        parent: 'classifier_decision_batch_candidates',
        child: 'classifier_decision_batch_candidates__default',
        strategy: 'RANGE (batch_id)',
        bound: 'DEFAULT',
      },
      {
        parent: 'story_classifier_results',
        child: 'story_classifier_results__default',
        strategy: 'RANGE (story_id)',
        bound: 'DEFAULT',
      },
      {
        parent: 'topic_classifier_results',
        child: 'topic_classifier_results__default',
        strategy: 'RANGE (topic_id)',
        bound: 'DEFAULT',
      },
    ])
  })
})
