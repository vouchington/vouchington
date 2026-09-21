import { beginTransaction } from '@data-stores/psql'
import { isUUID } from '@modules/utils/ids'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic'
import sql from 'sql-template-strings'
import { readCompleteClassifierDecision } from './read-complete-decision.mts'
import { mapClassifierProbabilityToTopicVoteScore } from './topic-vote-mapper.mts'
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
): Promise<ApplyTopicClassifierDecisionVotesResult> {
  assertApplicationInput(input)
  await using transaction = await beginTransaction()
  const decision = await readCompleteClassifierDecision(transaction, input.batchId, 'topic')
  const results = validateTopicDecision(decision, input.expectedBindings)
  const appliedTopicIds = await applyTopicResults(
    transaction,
    input.sharedActorId,
    decision,
    results,
  )
  await transaction.commit()
  return { appliedTopicIds }
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
  query: Awaited<ReturnType<typeof beginTransaction>>,
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
  const appliedTopicIds = await applyTopicResults(query, sharedActorId, decision, remaining)
  return applies ? [result.topicId, ...appliedTopicIds] : appliedTopicIds
}

async function recordTopicVoteApplication(
  query: Awaited<ReturnType<typeof beginTransaction>>,
  sharedActorId: string,
  decision: PersistedClassifierDecision,
  result: PersistedTopicDecisionResult,
): Promise<boolean> {
  const { rows } = await query<{ batch_id: string }>(sql`
    /* recordTopicClassifierVoteApplication */
    INSERT INTO classifier_topic_vote_applications (
      shared_actor_id, topic_id, post_id, rss_feed_item_id, classifier_id,
      prompt_version_id, batch_id, result_id
    ) VALUES (
      ${sharedActorId}, ${result.topicId}, ${decision.subject.postId}, ${decision.subject.rssFeedItemId},
      ${decision.classifierId}, ${decision.promptVersionId}, ${decision.batchId}, ${result.id}
    )
    ON CONFLICT (shared_actor_id, topic_id, post_id, rss_feed_item_id)
    DO UPDATE SET
      classifier_id = EXCLUDED.classifier_id,
      prompt_version_id = EXCLUDED.prompt_version_id,
      batch_id = EXCLUDED.batch_id,
      result_id = EXCLUDED.result_id
    WHERE classifier_topic_vote_applications.batch_id < EXCLUDED.batch_id
    RETURNING batch_id
  `)
  return rows.length === 1
}
