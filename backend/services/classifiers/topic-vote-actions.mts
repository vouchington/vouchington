import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic'
import { readCompleteClassifierDecision } from './read-complete-decision.mts'
import {
  assertApplicationInput,
  assertSharedSystemActor,
  validateTopicDecision,
  type ExpectedTopicClassifierBinding,
  type PersistedTopicDecisionResult,
} from './topic-decision-validation.mts'
import { mapClassifierProbabilityToTopicVoteScore } from './topic-vote-mapper.mts'
import { recordTopicVoteApplication } from './topic-vote-receipt.mts'
import type { PersistedClassifierDecision } from './types.mts'

export type { ExpectedTopicClassifierBinding }
export type ApplyTopicClassifierDecisionVotesInput = {
  batchId: string
  sharedActorId: string
  expectedBindings: readonly ExpectedTopicClassifierBinding[]
}

export type ApplyTopicClassifierDecisionVotesResult = {
  appliedTopicIds: readonly string[]
}
export async function applyTopicClassifierDecisionVotes(
  input: ApplyTopicClassifierDecisionVotesInput,
  options: { query?: OwnedTransaction } = {},
): Promise<ApplyTopicClassifierDecisionVotesResult> {
  assertApplicationInput(input)
  if (options.query) return applyTopicClassifierDecisionVotesWithQuery(input, options.query)
  await using transaction = await beginTransaction()
  const result = await applyTopicClassifierDecisionVotesWithQuery(input, transaction)
  await transaction.commit()
  return result
}

async function applyTopicClassifierDecisionVotesWithQuery(
  input: ApplyTopicClassifierDecisionVotesInput,
  query: OwnedTransaction,
): Promise<ApplyTopicClassifierDecisionVotesResult> {
  const decision = await readCompleteClassifierDecision(query, input.batchId, 'topic')
  const results = validateTopicDecision(decision, input.expectedBindings)
  await assertSharedSystemActor(query, input.sharedActorId)
  const appliedTopicIds = await applyTopicResults(query, input.sharedActorId, decision, results)
  return { appliedTopicIds }
}

async function applyTopicResults(
  query: OwnedTransaction,
  sharedActorId: string,
  decision: PersistedClassifierDecision,
  results: readonly PersistedTopicDecisionResult[],
): Promise<string[]> {
  const orderedResults = results.toSorted((a, b) => a.topicId.localeCompare(b.topicId))
  return applyOrderedTopicResults(query, sharedActorId, decision, orderedResults)
}

async function applyOrderedTopicResults(
  query: OwnedTransaction,
  sharedActorId: string,
  decision: PersistedClassifierDecision,
  results: readonly PersistedTopicDecisionResult[],
): Promise<string[]> {
  const [result, ...remaining] = results
  if (!result) return []
  const applies = await recordTopicVoteApplication(query, sharedActorId, decision, result)
  if (applies) {
    await upsertTopicElectionVotes(
      sharedActorId,
      [
        {
          entityId: result.topicId,
          score: mapClassifierProbabilityToTopicVoteScore(
            result.probability,
            result.effectiveThresholds,
          ),
        },
      ],
      undefined,
      { query },
    )
  }
  const appliedTopicIds = await applyOrderedTopicResults(query, sharedActorId, decision, remaining)
  return applies ? [result.topicId, ...appliedTopicIds] : appliedTopicIds
}
