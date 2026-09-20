import { afterAll, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { onGracefulShutdown } from '@data-stores/psql'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'

describe('persistClassifierDecision failures', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rolls back batch and call rows when result insertion fails', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    await expect(
      persistClassifierDecision({
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
                topicId: uuidv7(),
                storedCandidateId: null,
                probability: 0.5,
                rawResponse: { type: 'noul', probability: 0.5 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/topic_classifier_results_topic_id_fkey/)
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 0,
      calls: 0,
      snapshots: 0,
      topic_results: 0,
    })
  })

  it('rejects a classifier candidate kind that does not match the subject family', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    await expect(
      persistClassifierDecision({
        batchId,
        classifierId: fixture.classifierId,
        promptVersionId: fixture.promptVersionId,
        subject: { postId: null, rssFeedItemId: fixture.rssFeedItemId },
        scope: { scopeCategory: 'global', scopeCommunityId: null },
        calls: [
          {
            shardOrdinal: 0,
            results: [
              {
                candidateKind: 'topic',
                topicId: fixture.topicId,
                storedCandidateId: null,
                probability: 0.5,
                rawResponse: { type: 'noul', probability: 0.5 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow('does not match its decision subject')
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 0,
      calls: 0,
      topic_results: 0,
    })
  })
})
