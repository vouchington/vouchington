import type { OwnedTransaction } from '@data-stores/psql'
import {
  requestFollowOnClassifierRun,
  type ClassifierRunLease,
  type ClassifierRunOutcomes,
} from '@services/classifier-runs'
import { applyTopicClassifierDecisionRelations } from '@services/classifiers/topic-relation-actions'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import type { AutotaggerRunConfiguration } from './configuration.mts'

export type AutotaggerEffects = { addedTopicIds: readonly string[] }

async function applyTaggingDecision(
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

/**
 * Applies the durable C6 decision to the exact post or feed item it classified, as that subject's
 * topic relations and the shared classifier actor's votes on them, in the completion transaction.
 * The run receipt (classifier, subject, content revision) is the replay and stale-result fence, so a
 * retry only ever sees the run incomplete or fully applied. No global topic vote is written.
 *
 * The same transaction records the request for the scoped reasoning autotagger (C7), which runs
 * only after this result: it commits with the tags it must not repeat, whether or not this run
 * added any, and never fires for a run that did not complete.
 */
export async function applyAutotaggerEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<AutotaggerRunConfiguration>,
  outcomes: ClassifierRunOutcomes<never>,
): Promise<AutotaggerEffects> {
  const effects = await applyTaggingDecision(query, lease, outcomes)
  await requestFollowOnClassifierRun(query, {
    subject: lease.subject,
    inputSha256: lease.inputSha256,
    classifierSlug: AUTOTAGGER_AGENT_SLUG,
  })
  return effects
}
