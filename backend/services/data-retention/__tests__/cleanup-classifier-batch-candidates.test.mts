import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { sweepClassifierBatchCandidates } from '../cleanup-classifier-batch-candidates.mts'

describe('classifier batch candidate retention', () => {
  it('keeps pending and result-referenced snapshots while retiring eligible old rows', async () => {
    const fixture = await createClassifierFixture()
    const at = new Date(Date.UTC(2015, 0, 1) + randomInt(1_000_000_000, 3_000_000_000))
    const protectedBatch = await fixture.createTopicBatch({ at })
    const eligibleBatch = await fixture.createTopicBatch({ at: new Date(at.getTime() + 1_000) })
    const protectedStory = await fixture.createStoryBatch({ at: new Date(at.getTime() + 500) })

    await expect(
      fixture.deleteBatchCandidate(protectedBatch.batchId, fixture.topicCandidateId),
    ).rejects.toMatchObject({ code: '23503' })
    await fixture.insertTopicResult(protectedBatch)
    await fixture.insertStoryResult(protectedStory.batchId, protectedStory.callId)
    await fixture.completeBatch(protectedBatch.batchId)
    await fixture.completeBatch(protectedStory.batchId)
    await expect(
      fixture.deleteBatchCandidate(protectedBatch.batchId, fixture.topicCandidateId),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      fixture.deleteBatchCandidate(protectedStory.batchId, fixture.storyCandidateId),
    ).rejects.toMatchObject({ code: '23503' })
    await fixture.completeBatch(eligibleBatch.batchId)
    await fixture.deleteCall(eligibleBatch.callId)

    const cutoffId = getMinUUIDv7ForDate(new Date(at.getTime() + 2_000))
    const lowerBoundId = getMinUUIDv7ForDate(new Date(at.getTime() - 1))
    const cleanup = await sweepClassifierBatchCandidates(cutoffId, lowerBoundId, 10, 1)
    expect(cleanup.scanned).toBe(3)
    expect(cleanup.hasMore).toBe(false)
    expect(cleanup.deleted).toBe(1)
    const protectedFacts = await fixture.getDecisionPersistenceFacts(protectedBatch.batchId)
    expect(protectedFacts.snapshots).toBe(1)
    expect(protectedFacts.topic_results).toBe(1)
    const storyFacts = await fixture.getDecisionPersistenceFacts(protectedStory.batchId)
    expect(storyFacts.snapshots).toBe(1)
    expect(storyFacts.story_results).toBe(1)
    expect((await fixture.getDecisionPersistenceFacts(eligibleBatch.batchId)).snapshots).toBe(0)
  })
})
