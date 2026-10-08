import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import { applyTopicFactRelations } from '@services/classifiers/topic-fact-relations'
import type { AutotaggerAgentRunConfiguration } from './configuration.mts'
import type { AutotaggerAgentFacts } from './facts.mts'

export type AutotaggerAgentEffects = { addedTopicIds: readonly string[] }

/**
 * Applies the durable reasoning facts to the exact post or feed item they were found for, as that
 * subject's topic relations and the agent actor's +1 votes on them, in the completion transaction.
 * The run receipt (classifier, subject, content revision, configuration) is the replay and
 * stale-result fence, so a retry only ever sees the run incomplete or fully applied.
 *
 * The write is add-only: a topic is added only when the subject has no relation for it, so the
 * first stage's tags are never repeated, voted on, removed or overridden and a tag someone deleted
 * is never brought back. An agent reports only what is true, so a topic it left out writes nothing.
 */
export async function applyAutotaggerAgentEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>,
  outcomes: ClassifierRunOutcomes<AutotaggerAgentFacts>,
): Promise<AutotaggerAgentEffects> {
  return applyTopicFactRelations(
    {
      subject: lease.subject,
      sharedActorId: lease.resolved.actorId,
      topicIds: outcomes.local?.topicIds ?? [],
      candidateTopicIds: lease.capturedTopicIds,
    },
    query,
  )
}
