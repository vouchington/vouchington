import { v7 as uuidv7 } from 'uuid'
import type { OwnedTransaction } from '@data-stores/psql'
import { applyTopicClassifierDecisionRelations } from '../../../../services/classifiers/topic-relation-actions.mts'
import { createTestPost, createTestTopic } from '../../../entities/create-test-entities.mts'
import { createSystemUser } from '../../../entities/users.mts'
import { createClassifierFixture } from '../classifiers.mts'
import { persistSubjectTopicDecision, runtimeBindings } from './subject-topic-relations.mts'

/**
 * A post with a persisted, all-positive topic decision over two fresh topics, and an `apply` that
 * runs the relation applier on a caller-owned transaction, as the run completion does.
 */
export async function createTopicRelationCase() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  const actor = await createSystemUser(`classifier-relations-${uuidv7()}`)
  const post = await createTestPost()
  const topicIds = (await Promise.all([createTestTopic({}), createTestTopic({})])).map(
    topic => topic.id,
  )
  const subject = { postId: post.id, rssFeedItemId: null } as const
  const decision = await persistSubjectTopicDecision(
    fixture,
    subject,
    topicIds.map(topicId => ({ topicId, probability: 0.9 })),
  )
  const apply = (transaction: OwnedTransaction) =>
    applyTopicClassifierDecisionRelations(
      {
        decision,
        subject,
        sharedActorId: actor.id,
        expectedBindings: runtimeBindings(topicIds),
      },
      transaction,
    )
  return { actor, subject, topicIds: topicIds.toSorted(), apply }
}
