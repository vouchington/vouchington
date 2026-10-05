import type { OwnedTransaction } from '@data-stores/psql'
import { isUUID } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import type { PersistedClassifierDecision, PersistedClassifierDecisionResult } from './types.mts'

export type ExpectedTopicClassifierBinding = {
  topicId: string
  storedCandidateId: string | null
}

export type TopicClassifierApplicationInput = {
  batchId: string
  sharedActorId: string
  expectedBindings: readonly ExpectedTopicClassifierBinding[]
}

export type PersistedTopicDecisionResult = Extract<
  PersistedClassifierDecisionResult,
  { candidateKind: 'topic' }
>

/** Rejects malformed identifiers and duplicate or missing bindings before any decision is read. */
export function assertApplicationInput(input: TopicClassifierApplicationInput): void {
  if (!isUUID(input.batchId) || !isUUID(input.sharedActorId)) {
    throw new Error(
      'Classifier topic relation application requires UUID batch and shared actor IDs',
    )
  }
  if (input.expectedBindings.length === 0) {
    throw new Error('Classifier topic relation application requires expected bindings')
  }
  const keys = new Set<string>()
  for (const binding of input.expectedBindings) {
    if (
      !isUUID(binding.topicId) ||
      (binding.storedCandidateId && !isUUID(binding.storedCandidateId))
    ) {
      throw new Error('Classifier topic relation application binding IDs must be UUIDs')
    }
    const key = bindingKey(binding)
    if (keys.has(key))
      throw new Error('Classifier topic relation application cannot duplicate bindings')
    keys.add(key)
  }
}

/** Requires one complete topic-only decision whose results all belong to the expected bindings. */
export function validateTopicDecision(
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
    throw new Error('Classifier topic relation application requires a complete topic-only decision')
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
        'Classifier topic relation application decision lineage is incomplete or inconsistent',
      )
    }
    seen.add(key)
  }
  return topicResults
}

/** Serializes against the actor's lifecycle and requires it to be a system user. */
export async function assertSharedSystemActor(
  query: OwnedTransaction,
  sharedActorId: string,
): Promise<void> {
  await query(sql`/* lockClassifierTopicRelationActor */
    SELECT fn_lock_active_user_for_mutation(${sharedActorId}::uuid)
  `)
  const { rows } = await query<{
    platform_account_kind: 'official' | 'system' | null
  }>(sql`/* readClassifierTopicRelationActor */
    SELECT platform_account_kind FROM users WHERE id = ${sharedActorId}::uuid
  `)
  if (rows[0]?.platform_account_kind !== 'system') {
    throw new Error('Classifier topic relation votes require a system actor')
  }
}

function bindingKey(binding: ExpectedTopicClassifierBinding): string {
  return `${binding.topicId}:${binding.storedCandidateId ?? 'runtime'}`
}
