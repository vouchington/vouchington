import { write, type QueryExecutor } from '@data-stores/psql'
import {
  getEntityRelationMetadataOrThrow,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { refreshEntityRelationVoteStatsById } from '../../../../services/elections-votes/entity-relation/refresh-stats.mts'
import { upsertEntityRelationElectionVotes } from '../../../../services/elections-votes/entity-relation/votes-upsert.mts'
import { upsertEntityRelation } from '../../../../services/entity-relations/index.mts'
import { persistClassifierDecision } from '../../../../services/classifiers/persist-classifier-decision.mts'
import { applyTopicClassifierDecisionRelations } from '../../../../services/classifiers/topic-relation-actions.mts'
import type { PersistedClassifierDecision } from '../../../../services/classifiers/types.mts'
import type { PrivateUser } from '../../../../services/users/types.mts'
import { runClassifierBorrowedTestTransaction } from '../classifier-borrowed-transactions.mts'

export type TopicRelationSubject =
  | { postId: string; rssFeedItemId: null }
  | { postId: null; rssFeedItemId: string }

export type SubjectTopicRelationFact = {
  id: string
  topicId: string
  createdById: string | null
  deletedAt: Date | null
  netScore: number
  /** Every vote row on the relation, oldest first (the history is append-only). */
  votes: Array<{ userId: string; score: number }>
}

function relationMetadata(subject: TopicRelationSubject) {
  return getEntityRelationMetadataOrThrow({
    subjectType: subject.postId === null ? 'rss_feed_item' : 'post',
    objectType: 'topic',
    predicate: 'category',
  })
}

/** The subject's topic category relations, soft-deleted ones included, with their vote history. */
export async function readSubjectTopicRelationFacts(
  subject: TopicRelationSubject,
  query: QueryExecutor = write,
): Promise<SubjectTopicRelationFact[]> {
  const metadata = relationMetadata(subject)
  const { rows } = await query<{
    id: string
    topic_id: string
    created_by_id: string | null
    deleted_at: Date | null
    net_score: number
    votes: Array<{ userId: string; score: number }>
  }>(
    sql`/* readSubjectTopicRelationFacts */
      SELECT relation.id, relation.object_id AS topic_id, relation.created_by_id,
        relation.deleted_at, relation.votes_score_net AS net_score,
        COALESCE((
          SELECT json_agg(json_build_object('userId', vote.user_id, 'score', vote.score)
            ORDER BY vote.id)
          FROM `
      .append(getEntityRelationVoteTableName(metadata))
      .append(
        sql` vote WHERE vote.entity_relation_id = relation.id
        ), '[]'::json) AS votes
      FROM `,
      )
      .append(metadata.table_name).append(sql` relation
      WHERE relation.subject_id = ${subject.postId ?? subject.rssFeedItemId}::uuid
      ORDER BY relation.object_id
    `),
  )
  return rows.map(row => ({
    id: row.id,
    topicId: row.topic_id,
    createdById: row.created_by_id,
    deletedAt: row.deleted_at,
    netScore: row.net_score,
    votes: row.votes,
  }))
}

/** The topic ids of the subject's live (not soft-deleted) relations, sorted. */
export async function readLiveSubjectTopicIds(
  subject: TopicRelationSubject,
  query: QueryExecutor = write,
): Promise<string[]> {
  const facts = await readSubjectTopicRelationFacts(subject, query)
  return facts.filter(fact => fact.deletedAt === null).map(fact => fact.topicId)
}

export type ClassifierRelationFixture = {
  classifierId: string
  promptVersionId: string
}

/**
 * Persists one runtime topic decision (no stored candidate snapshots, like C6's) for the subject.
 * The default thresholds are 0.25 and 0.75, so 0.9 votes +1, 0.5 votes 0 and 0.1 votes -1.
 * Batch ids are time-ordered, so a later call is the newer decision.
 */
export async function persistSubjectTopicDecision(
  fixture: ClassifierRelationFixture,
  subject: TopicRelationSubject,
  results: ReadonlyArray<{ topicId: string; probability: number }>,
  batchId: string = uuidv7(),
): Promise<PersistedClassifierDecision> {
  const { decision } = await persistClassifierDecision({
    batchId,
    classifierId: fixture.classifierId,
    promptVersionId: fixture.promptVersionId,
    subject,
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: results.map(result => ({
          candidateKind: 'topic' as const,
          topicId: result.topicId,
          storedCandidateId: null,
          probability: result.probability,
          rawResponse: { probability: result.probability },
        })),
      },
    ],
  })
  return decision
}

/** The runtime bindings an applier expects for a decision over these topics. */
export function runtimeBindings(topicIds: readonly string[]) {
  return topicIds.map(topicId => ({ topicId, storedCandidateId: null }))
}

/**
 * Applies the decision's relations in a transaction of its own, committed when it returns (the
 * shared lifecycle commits the same call together with the run receipt).
 */
export function applyDecisionRelationsForTest(
  decision: PersistedClassifierDecision,
  sharedActorId: string,
  topicIds: readonly string[],
  subject: TopicRelationSubject = decision.subject,
  options: { addOnly?: boolean } = {},
) {
  return runClassifierBorrowedTestTransaction(
    transaction =>
      applyTopicClassifierDecisionRelations(
        {
          decision,
          subject,
          sharedActorId,
          expectedBindings: runtimeBindings(topicIds),
          ...options,
        },
        transaction,
      ),
    { commit: true },
  )
}

/**
 * A person tags the subject with the topic: they create the relation and vote +1 on it. The
 * statistics are refreshed here, so no queued refresh changes the relation under a later assertion.
 */
export async function createHumanTopicRelation(
  user: PrivateUser,
  subject: TopicRelationSubject,
  topicId: string,
): Promise<{ id: string }> {
  const [relation] = await upsertEntityRelation(
    user,
    relationMetadata(subject),
    { id: subject.postId ?? subject.rssFeedItemId },
    [{ id: topicId }],
  )
  await refreshEntityRelationVoteStatsById(relation!.id!)
  return { id: relation!.id! }
}

/** A person changes their vote on a relation and the relation's statistics are refreshed. */
export async function castHumanTopicRelationVote(
  userId: string,
  subject: TopicRelationSubject,
  relationId: string,
  score: -1 | 0 | 1,
): Promise<void> {
  await upsertEntityRelationElectionVotes(
    userId,
    [{ entityId: relationId, score }],
    undefined,
    relationMetadata(subject),
  )
  await refreshEntityRelationVoteStatsById(relationId)
}
