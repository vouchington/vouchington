import { applyTopicFactRelations } from '../../../../services/classifiers/topic-fact-relations.mts'
import { runClassifierBorrowedTestTransaction } from '../classifier-borrowed-transactions.mts'
import type { TopicRelationSubject } from './subject-topic-relations.mts'

/** Applies an agent's reported topics as add-only relations, committed when it returns. */
export function applyFactRelationsForTest(
  sharedActorId: string,
  topicIds: readonly string[],
  candidateTopicIds: readonly string[],
  subject: TopicRelationSubject,
) {
  return runClassifierBorrowedTestTransaction(
    transaction =>
      applyTopicFactRelations({ subject, sharedActorId, topicIds, candidateTopicIds }, transaction),
    { commit: true },
  )
}
