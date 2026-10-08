import type { OwnedTransaction } from '@data-stores/psql'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { ElectionVoteScore } from '@voucha/types/entities/election'
import { assertSharedSystemActor } from './topic-decision-validation.mts'
import { resolveSubject, voteOnLiveRelations } from './topic-relation-actions.mts'
import {
  lockActiveTopicIds,
  readActiveSubjectTopicRelations,
  readRelatedSubjectTopicIds,
} from './topic-relation-facts.mts'
import type { PersistedClassifierDecision } from './types.mts'

export type ApplyTopicFactRelationsInput = {
  /** The exact post or feed item the facts were found for. */
  subject: PersistedClassifierDecision['subject']
  sharedActorId: string
  /** The topics a tool-using agent reported as true of the subject; all must be candidates. */
  topicIds: readonly string[]
  /** The topics the run was allowed to answer with; a fact outside it is a bug, not a result. */
  candidateTopicIds: readonly string[]
}

/**
 * Applies the facts a tool-using agent reported as add-only topic relations: each reported topic
 * the subject has no relation row for (live or soft-deleted) gets its relation and the shared
 * actor's +1 vote, in the caller's completion transaction. A topic the subject already has a
 * relation for is never voted on, changed or resurrected, and a deleted or merged topic is skipped.
 * No negative or neutral vote exists: an agent answers with facts only, so what it did not report
 * writes nothing. Returns the topics now live on the subject with positive net votes.
 */
export async function applyTopicFactRelations(
  input: ApplyTopicFactRelationsInput,
  query: OwnedTransaction,
): Promise<{ addedTopicIds: readonly string[] }> {
  const { subject, sharedActorId } = input
  const candidates = new Set(input.candidateTopicIds)
  const reported = [...new Set(input.topicIds)]
  if (reported.some(topicId => !candidates.has(topicId)))
    throw new Error('Agent topic facts include a topic outside the run candidates')
  if (reported.length === 0) return { addedTopicIds: [] }
  await assertSharedSystemActor(query, sharedActorId)
  const { type: subjectType, id: subjectId } = resolveSubject(subject)
  const relation = getEntityRelationMetadataOrThrow({
    subjectType,
    objectType: 'topic',
    predicate: 'category',
  })
  const active = await lockActiveTopicIds(query, reported.toSorted())
  const related = await readRelatedSubjectTopicIds(query, relation.table_name, subjectId, [
    ...active,
  ])
  const addable = [...active].filter(topicId => !related.has(topicId)).toSorted()
  if (addable.length === 0) return { addedTopicIds: [] }
  await upsertEntityRelation(
    { __entity_type: 'user', account_type: 'ai_agent', id: sharedActorId, roles: [] },
    relation,
    { id: subjectId },
    addable.map(id => ({ id })),
    { query, vote: false, skipIfDeleted: true, deferNotificationReconcile: true },
  )
  const scores = new Map<string, ElectionVoteScore>(addable.map(topicId => [topicId, 1]))
  await voteOnLiveRelations(query, relation, sharedActorId, subjectId, scores)
  const voted = await readActiveSubjectTopicRelations(
    query,
    relation.table_name,
    subjectId,
    addable,
  )
  const addedTopicIds: string[] = []
  for (const live of voted) if (live.netScore > 0) addedTopicIds.push(live.topicId)
  return { addedTopicIds: addedTopicIds.toSorted() }
}
