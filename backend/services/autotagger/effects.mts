import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { applyTopicClassifierDecisionRelations } from '@services/classifiers/topic-relation-actions'
import type { AutotaggerRunConfiguration } from './configuration.mts'

export type AutotaggerEffects = { addedTopicIds: readonly string[] }

/**
 * Applies the durable C6 decision to the exact post or feed item it classified, as that subject's
 * topic relations and the shared classifier actor's votes on them, in the completion transaction.
 * The run receipt (classifier, subject, content revision) is the replay and stale-result fence, so a
 * retry only ever sees the run incomplete or fully applied. No global topic vote is written.
 */
export async function applyAutotaggerEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<AutotaggerRunConfiguration>,
  outcomes: ClassifierRunOutcomes<never>,
): Promise<AutotaggerEffects> {
  const decision = outcomes.remoteDecision
  if (!decision) {
    // Every captured topic was deleted after reservation, so the run asked nothing and tags nothing.
    if (lease.capturedTopicIds.length === 0) return { addedTopicIds: [] }
    throw new Error('tagging run has no remote decision to apply')
  }
  return applyTopicClassifierDecisionRelations(
    {
      decision,
      subject: lease.subject,
      sharedActorId: lease.resolved.actorId,
      expectedBindings: lease.capturedTopicIds.map(topicId => ({
        topicId,
        storedCandidateId: null,
      })),
    },
    query,
  )
}
