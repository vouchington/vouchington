import { write } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  createClassifierRunSchemaFixture,
  createCompletedClassifierDecisionBatchAt,
} from '../../test-helpers/data-stores/psql/classifier-runs/schema-fixture.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import {
  readCompleteClassifierDecision,
  readCompleteClassifierDecisionForActiveRun,
  readCompleteClassifierDecisionIfExistsFromPrimary,
} from './read-complete-decision.mts'

describe('readCompleteClassifierDecisionIfExistsFromPrimary', () => {
  it('returns null for a batch ID that was never committed', async () => {
    await expect(
      readCompleteClassifierDecisionIfExistsFromPrimary(uuidv7(), 'topic'),
    ).resolves.toBeNull()
  })

  it('recovers a committed topic decision from the primary without a caller-owned transaction', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()
    await persistClassifierDecision({
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
              probability: 0.6,
              rawResponse: { type: 'noul', probability: 0.6 },
            },
          ],
        },
      ],
    })

    await expect(
      readCompleteClassifierDecisionIfExistsFromPrimary(batchId, 'topic'),
    ).resolves.toMatchObject({
      batchId,
      subject: { postId: fixture.postId, rssFeedItemId: null },
      results: [expect.objectContaining({ topicId: fixture.topicId })],
    })
  })

  it('recovers a committed story decision on an RSS feed item subject', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()
    await persistClassifierDecision({
      batchId,
      classifierId: fixture.storyClassifierId,
      promptVersionId: fixture.storyPromptVersionId,
      subject: { postId: null, rssFeedItemId: fixture.rssFeedItemId },
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'story',
              storyId: fixture.storyId,
              storedCandidateId: fixture.storyCandidateId,
              probability: 0.9,
              rawResponse: { type: 'choice', probabilities: { story: 0.9 } },
            },
          ],
        },
      ],
    })

    await expect(
      readCompleteClassifierDecisionIfExistsFromPrimary(batchId, 'story'),
    ).resolves.toMatchObject({
      batchId,
      subject: { postId: null, rssFeedItemId: fixture.rssFeedItemId },
      results: [expect.objectContaining({ storyId: fixture.storyId })],
    })
  })

  it('allows an unfinished run to settle its retained decision after the public replay cutoff', async () => {
    const fixture = await createClassifierFixture()
    const at = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)
    const batchId = await createCompletedClassifierDecisionBatchAt({
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      postId: fixture.postId,
      at,
    })
    const run = await createClassifierRunSchemaFixture({
      classifierId: fixture.classifierId,
      postId: fixture.postId,
      decisionBatchId: batchId,
    })
    await run.update({ outcomes_persisted_at: at })

    await expect(readCompleteClassifierDecision(write, batchId, 'topic')).rejects.toThrow(
      'outside the retention window',
    )
    await expect(
      readCompleteClassifierDecisionForActiveRun(write, run.id, batchId, 'topic'),
    ).resolves.toMatchObject({ batchId, results: [] })

    await run.update({ completed_at: new Date() })
    await expect(
      readCompleteClassifierDecisionForActiveRun(write, run.id, batchId, 'topic'),
    ).rejects.toThrow('outside the retention window')
  })
})
