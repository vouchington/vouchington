import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { applyTopicClassifierDecisionRelations } from '@services/classifiers/topic-relation-actions'
import type { AutotaggerAgentRunConfiguration } from './configuration.mts'

export type AutotaggerAgentEffects = { addedTopicIds: readonly string[] }

/**
 * Applies the durable reasoning decision to the exact post or feed item it classified, as that
 * subject's topic relations and the agent actor's +1 votes on them, in the completion transaction.
 * The run receipt (classifier, subject, content revision, configuration) is the replay and
 * stale-result fence, so a retry only ever sees the run incomplete or fully applied.
 *
 * The write is add-only: a topic is added only when the subject has no relation for it, so the
 * first stage's tags are never repeated, voted on, removed or overridden and a tag someone deleted
 * is never brought back. A negative or neutral result writes nothing.
 */
export async function applyAutotaggerAgentEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>,
  outcomes: ClassifierRunOutcomes<never>,
): Promise<AutotaggerAgentEffects> {
  const decision = outcomes.remoteDecision
  if (!decision) {
    // Every captured topic was deleted after reservation, so the run asked nothing and tags nothing.
    if (lease.capturedTopicIds.length === 0) return { addedTopicIds: [] }
    throw new Error('autotagger agent run has no remote decision to apply')
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
      addOnly: true,
    },
    query,
  )
}
