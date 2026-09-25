import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'

describe('persistClassifierDecision subject matrix', () => {
  it('persists topic results for a topic classifier decision on an RSS feed item subject', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    const persisted = await persistClassifierDecision({
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
              storedCandidateId: fixture.topicCandidateId,
              probability: 0.6,
              rawResponse: { type: 'noul', probability: 0.6 },
            },
          ],
        },
      ],
    })

    expect(persisted.decision.subject).toEqual({
      postId: null,
      rssFeedItemId: fixture.rssFeedItemId,
    })
    expect(persisted.decision.results).toEqual([
      expect.objectContaining({
        candidateKind: 'topic',
        topicId: fixture.topicId,
        storedCandidateId: fixture.topicCandidateId,
      }),
    ])
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      topic_results: 1,
      story_results: 0,
    })
  })
})
