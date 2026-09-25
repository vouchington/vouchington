import { beginTransaction } from '@data-stores/psql'
import {
  classifierDecisionCandidateKind,
  classifierDecisionResultKey,
  flattenClassifierDecisionResults,
  normalizeClassifierDecisionInput,
  serializeClassifierRawResponse,
} from './decision-input.mts'
import { readCompleteClassifierDecision } from './read-complete-decision.mts'
import type {
  ClassifierDecisionInputResult,
  PersistClassifierDecisionInput,
  PersistClassifierDecisionResult,
  PersistedClassifierDecision,
  PersistedClassifierDecisionResult,
} from './types.mts'
import {
  captureClassifierDecisionStoredCandidateSnapshots,
  insertClassifierDecisionBatch,
  insertClassifierDecisionCalls,
  loadClassifierDecisionPromptThresholds,
} from './write-decision-lineage.mts'
import {
  expectedClassifierDecisionResultCount,
  insertClassifierDecisionResults,
} from './write-decision-results.mts'

export async function persistClassifierDecision(
  input: PersistClassifierDecisionInput,
): Promise<PersistClassifierDecisionResult> {
  const normalizedInput = normalizeClassifierDecisionInput(input)
  const candidateKind = classifierDecisionCandidateKind(normalizedInput)
  await using transaction = await beginTransaction()
  const inserted = await insertClassifierDecisionBatch(transaction, normalizedInput)
  if (!inserted) {
    const decision = await readCompleteClassifierDecision(transaction, input.batchId, candidateKind)
    assertExistingDecisionMatchesInput(decision, normalizedInput)
    await transaction.commit()
    return { decision, replayed: true }
  }

  const configuration = await loadClassifierDecisionPromptThresholds(transaction, normalizedInput)
  if (configuration.candidateKind !== candidateKind) {
    throw new Error('Classifier candidate kind does not match its decision subject and results')
  }
  if (candidateKind === 'story' && normalizedInput.subject.rssFeedItemId === null) {
    throw new Error('Classifier candidate kind does not match its decision subject')
  }
  const [snapshots, calls] = await Promise.all([
    captureClassifierDecisionStoredCandidateSnapshots(transaction, normalizedInput),
    insertClassifierDecisionCalls(transaction, normalizedInput),
  ])
  const resultCount = await insertClassifierDecisionResults(
    transaction,
    normalizedInput,
    calls,
    snapshots,
    configuration.thresholds,
  )
  assertCompletePersistence(normalizedInput, calls.length, snapshots.size, resultCount)
  const decision = await readCompleteClassifierDecision(transaction, input.batchId, candidateKind)
  assertExistingDecisionMatchesInput(decision, normalizedInput)
  await transaction.commit()
  return { decision, replayed: false }
}

function assertCompletePersistence(
  input: ReturnType<typeof normalizeClassifierDecisionInput>,
  callCount: number,
  snapshotCount: number,
  resultCount: number,
): void {
  if (callCount !== input.calls.length) {
    throw new Error('Classifier decision did not persist every call')
  }
  if (resultCount !== expectedClassifierDecisionResultCount(input)) {
    throw new Error('Classifier decision did not persist every candidate result')
  }
  const storedCount = flattenClassifierDecisionResults(input).filter(
    result => result.storedCandidateId,
  ).length
  if (snapshotCount !== storedCount) {
    throw new Error('Classifier decision did not persist every stored candidate snapshot')
  }
}

function assertExistingDecisionMatchesInput(
  existing: PersistedClassifierDecision,
  input: ReturnType<typeof normalizeClassifierDecisionInput>,
): void {
  if (!sameDecisionIdentity(existing, input)) {
    throw new Error('Classifier decision batch ID was reused with different input')
  }
  for (const [index, call] of input.calls.entries()) {
    if (existing.calls[index]?.shardOrdinal !== call.shardOrdinal) {
      throw new Error('Classifier decision batch ID was reused with different shard ordinals')
    }
  }
  const existingByResultKey = new Map(
    existing.results.map(result => [classifierDecisionResultKey(result), result]),
  )
  const existingCallOrdinals = new Map(existing.calls.map(call => [call.id, call.shardOrdinal]))
  for (const call of input.calls) {
    for (const result of call.results) {
      const persisted = existingByResultKey.get(classifierDecisionResultKey(result))
      if (
        !persisted ||
        existingCallOrdinals.get(persisted.decisionCallId) !== call.shardOrdinal ||
        !samePersistedResult(persisted, result)
      ) {
        throw new Error('Classifier decision batch ID was reused with different results')
      }
    }
  }
}

function sameDecisionIdentity(
  existing: PersistedClassifierDecision,
  input: ReturnType<typeof normalizeClassifierDecisionInput>,
): boolean {
  return (
    existing.classifierId === input.classifierId &&
    existing.promptVersionId === input.promptVersionId &&
    existing.scope.scopeCategory === input.scope.scopeCategory &&
    existing.scope.scopeCommunityId === input.scope.scopeCommunityId &&
    existing.subject.postId === input.subject.postId &&
    existing.subject.rssFeedItemId === input.subject.rssFeedItemId &&
    existing.calls.length === input.calls.length &&
    existing.results.length === flattenClassifierDecisionResults(input).length
  )
}

function samePersistedResult(
  persisted: PersistedClassifierDecisionResult,
  input: ClassifierDecisionInputResult,
): boolean {
  return (
    persisted.candidateKind === input.candidateKind &&
    persisted.probability === input.probability &&
    persisted.storedCandidateId === input.storedCandidateId &&
    serializeClassifierRawResponse(persisted.rawResponse) ===
      serializeClassifierRawResponse(input.rawResponse)
  )
}
