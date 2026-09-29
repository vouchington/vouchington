import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { isUUID } from '@modules/utils/ids'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic'
import sql from 'sql-template-strings'
import { readCompleteClassifierDecision } from './read-complete-decision.mts'
import { mapClassifierProbabilityToTopicVoteScore } from './topic-vote-mapper.mts'
import { recordTopicVoteApplication } from './topic-vote-receipt.mts'
import type { PersistedClassifierDecision, PersistedClassifierDecisionResult } from './types.mts'

export type ExpectedTopicClassifierBinding = {
  topicId: string
  storedCandidateId: string | null
}
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

async function assertSharedSystemActor(
  query: OwnedTransaction,
  sharedActorId: string,
): Promise<void> {
  await query(sql`/* lockClassifierTopicVoteActor */
    SELECT fn_lock_active_user_for_mutation(${sharedActorId}::uuid)
  `)
  const { rows } = await query<{ is_system: boolean }>(sql`/* readClassifierTopicVoteActor */
    SELECT is_system FROM users WHERE id = ${sharedActorId}::uuid
  `)
  if (!rows[0]?.is_system) {
    throw new Error('Classifier topic votes require a system actor')
  }
}

function assertApplicationInput(input: ApplyTopicClassifierDecisionVotesInput): void {
  if (!isUUID(input.batchId) || !isUUID(input.sharedActorId)) {
    throw new Error('Classifier topic vote application requires UUID batch and shared actor IDs')
  }
  if (input.expectedBindings.length === 0) {
    throw new Error('Classifier topic vote application requires expected bindings')
  }
  const keys = new Set<string>()
  for (const binding of input.expectedBindings) {
    if (
      !isUUID(binding.topicId) ||
      (binding.storedCandidateId && !isUUID(binding.storedCandidateId))
    ) {
      throw new Error('Classifier topic vote application binding IDs must be UUIDs')
    }
    const key = bindingKey(binding)
    if (keys.has(key))
      throw new Error('Classifier topic vote application cannot duplicate bindings')
    keys.add(key)
  }
}

type PersistedTopicDecisionResult = Extract<
  PersistedClassifierDecisionResult,
  { candidateKind: 'topic' }
>

function validateTopicDecision(
  decision: PersistedClassifierDecision,
  expectedBindings: readonly ExpectedTopicClassifierBinding[],
): readonly PersistedTopicDecisionResult[] {
  const callIds = new Set(decision.calls.map(call => call.id))
  const expected = new Set(expectedBindings.map(bindingKey))
  const results = decision.results
  if (
    results.length !== expected.size ||
    results.some(result => result.candidateKind !== 'topic')
  ) {
    throw new Error('Classifier topic vote application requires a complete topic-only decision')
  }
  const topicResults = results as readonly PersistedTopicDecisionResult[]
  const seen = new Set<string>()
  for (const result of topicResults) {
    const key = bindingKey(result)
    if (
      result.batchId !== decision.batchId ||
      result.classifierId !== decision.classifierId ||
      result.promptVersionId !== decision.promptVersionId ||
      !callIds.has(result.decisionCallId) ||
      !expected.has(key) ||
      seen.has(key)
    ) {
      throw new Error(
        'Classifier topic vote application decision lineage is incomplete or inconsistent',
      )
    }
    seen.add(key)
  }
  return topicResults
}

function bindingKey(binding: ExpectedTopicClassifierBinding): string {
  return `${binding.topicId}:${binding.storedCandidateId ?? 'runtime'}`
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
