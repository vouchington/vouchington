import { afterAll, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { onGracefulShutdown } from '../index.mts'

describe('classifier schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps candidate identity concrete and unique', async () => {
    const fixture = await createClassifierFixture()

    await expect(fixture.rejectCrossKindCandidate()).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.rejectBothEntityCandidate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectNoEntityCandidate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectDuplicateCandidate()).rejects.toMatchObject({ code: '23505' })
  })

  it('enforces inherited threshold pairs and immutable prompt content', async () => {
    const fixture = await createClassifierFixture()

    await expect(fixture.rejectInvalidInheritedThreshold()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectDefaultThresholdUpdate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectCandidateThresholdUpdate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectPromptIdentityMutation()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectClassifierIdentityMutation()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.activatePrompt()).resolves.toMatchObject({ rowCount: 1 })
  })

  it('allows community overrides only for global candidates', async () => {
    const fixture = await createClassifierFixture()

    await expect(fixture.enableGlobalCandidateForCommunity()).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(fixture.rejectCommunityOverrideForLocalCandidate()).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('keeps result lineage, candidate ownership, and append-only scope aligned', async () => {
    const fixture = await createClassifierFixture()
    const global = await fixture.createTopicBatch()

    await expect(
      fixture.insertTopicResult({ batchId: global.batchId, callId: global.callId }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      fixture.rejectResultScopeMismatch(global.batchId, global.callId),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectBatchMutation(global.batchId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      fixture.rejectResultThresholdMismatch(global.batchId, global.callId),
    ).rejects.toMatchObject({ code: '23514' })

    const community = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        batchId: community.batchId,
        callId: community.callId,
        candidateId: fixture.communityCandidateId,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.createReplacementCommunityThreshold()).rejects.toMatchObject({
      code: '23505',
    })
    await expect(fixture.deactivateCommunityThreshold()).resolves.toMatchObject({ rowCount: 1 })
    const replacementThresholdId = await fixture.createReplacementCommunityThreshold()
    const replacement = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        ...replacement,
        candidateId: fixture.communityCandidateId,
        thresholdId: replacementThresholdId,
        effectiveLower: 0.35,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.deleteCommunityThreshold()).rejects.toMatchObject({ code: '23001' })
    await expect(
      fixture.insertTopicResult({
        batchId: global.batchId,
        callId: global.callId,
        candidateId: fixture.communityCandidateId,
        topicId: fixture.communityTopicId,
      }),
    ).rejects.toMatchObject({ code: '23514' })
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

  it('persists valid story-classifier lineage in the concrete story result family', async () => {
    const fixture = await createClassifierFixture()
    const lineage = await fixture.createStoryBatch()

    await expect(fixture.insertStoryResult(lineage.batchId, lineage.callId)).resolves.toMatchObject(
      {
        rowCount: 1,
      },
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
        parent: 'story_classifier_results',
        child: 'story_classifier_results__default',
        strategy: 'RANGE (story_id)',
      },
      {
        parent: 'topic_classifier_results',
        child: 'topic_classifier_results__default',
        strategy: 'RANGE (topic_id)',
      },
    ])
  })
})
