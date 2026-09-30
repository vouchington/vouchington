import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { applyTopicClassifierDecisionVotes } from '@services/classifiers/topic-vote-actions'
import type { AutotaggerRunConfiguration } from './configuration.mts'

export type AutotaggerEffects = { appliedTopicIds: readonly string[] }

/**
 * Applies the durable C6 decision as topic votes by the shared classifier actor, in the completion
 * transaction, so a retry only ever sees the run incomplete or fully applied.
 */
export async function applyAutotaggerEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<AutotaggerRunConfiguration>,
  outcomes: ClassifierRunOutcomes<never>,
): Promise<AutotaggerEffects> {
  const decision = outcomes.remoteDecision
  if (!decision) throw new Error('tagging run has no remote decision to apply')
  const { appliedTopicIds } = await applyTopicClassifierDecisionVotes(
    {
      batchId: decision.batchId,
      sharedActorId: lease.resolved.actorId,
      expectedBindings: lease.capturedTopicIds.map(topicId => ({
        topicId,
        storedCandidateId: null,
      })),
    },
    { query },
  )
  return { appliedTopicIds }
}
