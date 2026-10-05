import type { OwnedTransaction } from '@data-stores/psql'
import '@services/elections-votes/entity-relation/register-election-vote-handler'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { mapClassifierProbabilityToTopicVoteScore } from '@services/classifiers/topic-vote-mapper'
import { applyTopicClassifierDecisionVotes } from '@services/classifiers/topic-vote-actions'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { PostClassifierLocalOutcome } from './local-outcome.mts'
import type { PostClassifierConfiguration } from './run-configuration.mts'

type Lease = ClassifierRunLease<PostClassifierConfiguration>
type Outcomes = ClassifierRunOutcomes<PostClassifierLocalOutcome>

export type PostClassifierEffects = {
  appliedTopicIds: readonly string[]
  taggedTopicIds: readonly string[]
}

/**
 * Applies the durable C5 outcomes in their required order: topic votes from the remote decision,
 * then tags for every positive topic. Both run in the completion transaction, so a retry only sees
 * the run incomplete or fully applied.
 */
export async function applyPostClassifierEffects(
  query: OwnedTransaction,
  lease: Lease,
  outcomes: Outcomes,
): Promise<PostClassifierEffects> {
  const postId = lease.subject.postId
  if (postId === null) throw new Error('post classifier run must have a post subject')
  const remoteQuestions = lease.resolved.configuration.remote?.questions
  const appliedTopicIds =
    outcomes.remoteDecision && remoteQuestions
      ? (
          await applyTopicClassifierDecisionVotes(
            {
              batchId: outcomes.remoteDecision.batchId,
              sharedActorId: lease.resolved.actorId,
              expectedBindings: remoteQuestions.map(question => ({
                topicId: question.topicId,
                storedCandidateId: question.candidateId,
              })),
            },
            { query },
          )
        ).appliedTopicIds
      : []
  const taggedTopicIds = getPositiveTopicIds(lease, outcomes)
  if (taggedTopicIds.length > 0) {
    await upsertEntityRelation(
      { __entity_type: 'user', account_type: 'ai_agent', id: lease.resolved.actorId, roles: [] },
      getEntityRelationMetadataOrThrow({
        subjectType: 'post',
        objectType: 'topic',
        predicate: 'category',
      }),
      { id: postId },
      taggedTopicIds.map(id => ({ id })),
      { query, vote: true, deferNotificationReconcile: true },
    )
  }
  return { appliedTopicIds, taggedTopicIds }
}

function getPositiveTopicIds(lease: Lease, outcomes: Outcomes): string[] {
  const positiveTopicIds = new Set<string>()
  if (outcomes.local?.is_flagged) {
    const local = lease.resolved.configuration.local
    if (!local) throw new Error('post classifier run local outcome is not configured')
    positiveTopicIds.add(local.topicId)
  }
  for (const result of outcomes.remoteDecision?.results ?? []) {
    if (
      result.candidateKind === 'topic' &&
      mapClassifierProbabilityToTopicVoteScore(result.probability, result.effectiveThresholds) === 1
    ) {
      positiveTopicIds.add(result.topicId)
    }
  }
  return [...positiveTopicIds].toSorted()
}
