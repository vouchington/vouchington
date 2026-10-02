import type { OwnedTransaction } from '@data-stores/psql'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { ElectionVoteScore } from '@voucha/types/entities/election'
import {
  assertApplicationInput,
  assertSharedSystemActor,
  validateTopicDecision,
  type ExpectedTopicClassifierBinding,
} from './topic-decision-validation.mts'
import {
  lockActiveTopicIds,
  readActiveSubjectTopicRelations,
  readRelatedSubjectTopicIds,
} from './topic-relation-facts.mts'
import { castSubjectTopicRelationVotes } from './topic-relation-votes.mts'
import { mapClassifierProbabilityToTopicVoteScore } from './topic-vote-mapper.mts'
import type { PersistedClassifierDecision } from './types.mts'

export type ApplyTopicClassifierDecisionRelationsInput = {
  decision: PersistedClassifierDecision
  /** The exact post or feed item the decision classified; it must equal `decision.subject`. */
  subject: PersistedClassifierDecision['subject']
  sharedActorId: string
  expectedBindings: readonly ExpectedTopicClassifierBinding[]
  /**
   * Only add: act on a positive result for a topic the subject has no relation row for at all, and
   * never vote -1 or 0, never vote on, change or resurrect a relation that already exists. A
   * second-stage classifier that must not override the first one's tags uses it.
   */
  addOnly?: boolean
}

export type ApplyTopicClassifierDecisionRelationsResult = {
  /** Topics the decision tagged onto the subject: positive, live relation, positive net votes. */
  addedTopicIds: readonly string[]
}

/**
 * Applies a durable topic decision to the subject it classified, as that subject's own category
 * relations and the shared actor's votes on them. The caller (the shared classifier-run completion
 * transaction) holds the subject lock and has fenced the content revision, so the write is
 * idempotent and needs no receipt of its own; it never writes a global topic vote.
 *
 * A positive result creates the subject's relation when it is absent (a soft-deleted relation is
 * never resurrected, and an existing relation keeps its creator); every result then votes -1, 0 or
 * +1 on the subject's live relation for that topic. Negative and neutral results never create a
 * relation, so a revision that stops matching can still flip the classifier's own earlier vote
 * without adding invisible rows. Deleted or merged topics are skipped. With `addOnly` only the
 * positive results for topics the subject has no relation row for are applied, each with a +1 vote.
 */
export async function applyTopicClassifierDecisionRelations(
  input: ApplyTopicClassifierDecisionRelationsInput,
  query: OwnedTransaction,
): Promise<ApplyTopicClassifierDecisionRelationsResult> {
  const { decision, subject, sharedActorId } = input
  assertApplicationInput({
    batchId: decision.batchId,
    sharedActorId,
    expectedBindings: input.expectedBindings,
  })
  const results = validateTopicDecision(decision, input.expectedBindings)
  assertSubjectMatchesDecision(subject, decision.subject)
  await assertSharedSystemActor(query, sharedActorId)

  const { type: subjectType, id: subjectId } = resolveSubject(subject)
  const relation = getEntityRelationMetadataOrThrow({
    subjectType,
    objectType: 'topic',
    predicate: 'category',
  })
  const orderedResults = results.toSorted((a, b) => a.topicId.localeCompare(b.topicId))
  const activeTopicIds = await lockActiveTopicIds(
    query,
    orderedResults.map(result => result.topicId),
  )
  const scores = new Map<string, ElectionVoteScore>()
  for (const result of orderedResults) {
    if (activeTopicIds.has(result.topicId)) {
      scores.set(
        result.topicId,
        mapClassifierProbabilityToTopicVoteScore(result.probability, result.effectiveThresholds),
      )
    }
  }
  if (input.addOnly) {
    const related = await readRelatedSubjectTopicIds(query, relation.table_name, subjectId, [
      ...scores.keys(),
    ])
    for (const [topicId, score] of scores) {
      if (score !== 1 || related.has(topicId)) scores.delete(topicId)
    }
  }
  const positiveTopicIds = [...scores].flatMap(([topicId, score]) => (score === 1 ? [topicId] : []))
  if (positiveTopicIds.length > 0) {
    await upsertEntityRelation(
      { __entity_type: 'user', id: sharedActorId, roles: [] },
      relation,
      { id: subjectId },
      positiveTopicIds.map(id => ({ id })),
      { query, vote: false, skipIfDeleted: true, deferNotificationReconcile: true },
    )
  }
  const scoredTopicIds = [...scores.keys()]
  await voteOnLiveRelations(query, relation, sharedActorId, subjectId, scores)
  const votedRelations = await readActiveSubjectTopicRelations(
    query,
    relation.table_name,
    subjectId,
    scoredTopicIds,
  )
  const addedTopicIds: string[] = []
  for (const live of votedRelations) {
    if (scores.get(live.topicId) === 1 && live.netScore > 0) addedTopicIds.push(live.topicId)
  }
  return { addedTopicIds: addedTopicIds.toSorted() }
}

/** Casts each topic's score as the shared actor's vote on the subject's live relation, if any. */
async function voteOnLiveRelations(
  query: OwnedTransaction,
  relation: Parameters<typeof castSubjectTopicRelationVotes>[1],
  sharedActorId: string,
  subjectId: string,
  scores: ReadonlyMap<string, ElectionVoteScore>,
): Promise<void> {
  const liveRelations = await readActiveSubjectTopicRelations(
    query,
    relation.table_name,
    subjectId,
    [...scores.keys()],
  )
  await castSubjectTopicRelationVotes(
    query,
    relation,
    sharedActorId,
    liveRelations.map(live => ({ relationId: live.id, score: scores.get(live.topicId)! })),
  )
}

function resolveSubject(subject: PersistedClassifierDecision['subject']): {
  type: 'post' | 'rss_feed_item'
  id: string
} {
  return subject.postId === null
    ? { type: 'rss_feed_item', id: subject.rssFeedItemId }
    : { type: 'post', id: subject.postId }
}

function assertSubjectMatchesDecision(
  subject: PersistedClassifierDecision['subject'],
  decisionSubject: PersistedClassifierDecision['subject'],
): void {
  if (
    subject.postId !== decisionSubject.postId ||
    subject.rssFeedItemId !== decisionSubject.rssFeedItemId
  ) {
    throw new Error('Classifier topic relation application subject does not match the decision')
  }
}
