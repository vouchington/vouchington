import type { OwnedTransaction } from '@data-stores/psql'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { applyTopicClassifierDecisionRelations } from '@services/classifiers/topic-relation-actions'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { PostClassifierLocalOutcome } from './local-outcome.mts'
import type { PostClassifierConfiguration } from './run-configuration.mts'

type Lease = ClassifierRunLease<PostClassifierConfiguration>
type Outcomes = ClassifierRunOutcomes<PostClassifierLocalOutcome>

export type PostClassifierEffects = {
  /** Topics now tagged onto the post by this run: local-detector tag and positive remote results. */
  addedTopicIds: readonly string[]
}

/**
 * Applies the durable C5 outcomes to the post they classified, as that post's own `category` topic
 * relations and the classifier actor's votes on them, in the completion transaction (so a retry only
 * sees the run incomplete or fully applied). Classifier accounts vote only on entity relations, so
 * no topic election vote is written.
 *
 * The remote decision goes first: a positive result creates the relation when it is absent and votes
 * +1, while a neutral or negative result votes 0 or -1 only on an already live relation and never
 * creates one (a soft-deleted relation is never resurrected). The local detector's positive outcome
 * then tags the post with a +1 relation vote.
 */
export async function applyPostClassifierEffects(
  query: OwnedTransaction,
  lease: Lease,
  outcomes: Outcomes,
): Promise<PostClassifierEffects> {
  const postId = lease.subject.postId
  if (postId === null) throw new Error('post classifier run must have a post subject')
  const remoteQuestions = lease.resolved.configuration.remote?.questions
  const remoteAddedTopicIds =
    outcomes.remoteDecision && remoteQuestions
      ? (
          await applyTopicClassifierDecisionRelations(
            {
              decision: outcomes.remoteDecision,
              subject: lease.subject,
              sharedActorId: lease.resolved.actorId,
              expectedBindings: remoteQuestions.map(question => ({
                topicId: question.topicId,
                storedCandidateId: question.candidateId,
              })),
            },
            query,
          )
        ).addedTopicIds
      : []
  const localTopicId = getLocalTagTopicId(lease, outcomes)
  if (localTopicId) await tagPostWithLocalTopic(query, lease, postId, localTopicId)
  const addedTopicIds = new Set(remoteAddedTopicIds)
  if (localTopicId) addedTopicIds.add(localTopicId)
  return { addedTopicIds: [...addedTopicIds].toSorted() }
}

function getLocalTagTopicId(lease: Lease, outcomes: Outcomes): string | null {
  if (!outcomes.local?.is_flagged) return null
  const local = lease.resolved.configuration.local
  if (!local) throw new Error('post classifier run local outcome is not configured')
  return local.topicId
}

async function tagPostWithLocalTopic(
  query: OwnedTransaction,
  lease: Lease,
  postId: string,
  topicId: string,
): Promise<void> {
  await upsertEntityRelation(
    { __entity_type: 'user', account_type: 'ai_agent', id: lease.resolved.actorId, roles: [] },
    getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    }),
    { id: postId },
    [{ id: topicId }],
    { query, vote: true, deferNotificationReconcile: true },
  )
}
