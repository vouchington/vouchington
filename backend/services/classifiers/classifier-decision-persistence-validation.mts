import type { ClassifierCandidateKind } from '@voucha/types'
import {
  classifierDecisionResultKey,
  flattenClassifierDecisionResults,
  serializeClassifierRawResponse,
  type NormalizedClassifierDecisionInput,
} from './decision-input.mts'
import {
  ClassifierDecisionReuseError,
  type ClassifierDecisionInputResult,
  type PersistedClassifierDecision,
  type PersistedClassifierDecisionResult,
} from './types.mts'
import type { LockedClassifierDecisionBatch } from './classifier-decision-batch-types.mts'
import { expectedClassifierDecisionResultCount } from './write-decision-results.mts'

export function assertCandidateKindMatchesSubject(
  configuredCandidateKind: ClassifierCandidateKind,
  candidateKind: ClassifierCandidateKind,
  subject: NormalizedClassifierDecisionInput['subject'],
  scope: NormalizedClassifierDecisionInput['scope'],
): void {
  if (configuredCandidateKind !== candidateKind) {
    throw new Error('Classifier candidate kind does not match its decision subject and results')
  }
  if (candidateKind === 'story' && subject.rssFeedItemId === null) {
    throw new Error('Classifier candidate kind does not match its decision subject')
  }
  if (
    candidateKind === 'community_prompt' &&
    (subject.postId === null || scope.scopeCategory !== 'community_ai')
  ) {
    throw new Error('Classifier candidate kind does not match its decision subject')
  }
}

export function storedCandidateIds(input: NormalizedClassifierDecisionInput): string[] {
  return flattenClassifierDecisionResults(input).flatMap(result =>
    result.storedCandidateId ? [result.storedCandidateId] : [],
  )
}

export function assertReservedSnapshotsMatchInput(
  snapshots: ReadonlyMap<string, unknown>,
  input: NormalizedClassifierDecisionInput,
): void {
  const candidateIds = storedCandidateIds(input)
  if (
    snapshots.size !== candidateIds.length ||
    candidateIds.some(candidateId => !snapshots.has(candidateId))
  ) {
    throw new ClassifierDecisionReuseError(
      'input',
      'Reserved classifier decision batch candidates do not match its input',
    )
  }
}

export function assertBatchMatchesInput(
  batch: LockedClassifierDecisionBatch,
  input: NormalizedClassifierDecisionInput,
): void {
  if (
    batch.classifierId !== input.classifierId ||
    batch.promptVersionId !== input.promptVersionId ||
    batch.postId !== input.subject.postId ||
    batch.rssFeedItemId !== input.subject.rssFeedItemId ||
    batch.scopeCategory !== input.scope.scopeCategory ||
    batch.scopeCommunityId !== input.scope.scopeCommunityId
  ) {
    throw new ClassifierDecisionReuseError(
      'input',
      'Classifier decision batch ID was reused with different input',
    )
  }
}

export function assertCompletePersistence(
  input: NormalizedClassifierDecisionInput,
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
  if (snapshotCount !== storedCandidateIds(input).length) {
    throw new Error('Classifier decision did not persist every stored candidate snapshot')
  }
}

export function assertExistingDecisionMatchesInput(
  existing: PersistedClassifierDecision,
  input: NormalizedClassifierDecisionInput,
): void {
  if (!sameDecisionIdentity(existing, input)) {
    throw new ClassifierDecisionReuseError(
      'input',
      'Classifier decision batch ID was reused with different input',
    )
  }
  for (const [index, call] of input.calls.entries()) {
    if (existing.calls[index]?.shardOrdinal !== call.shardOrdinal) {
      throw new ClassifierDecisionReuseError(
        'shard-ordinals',
        'Classifier decision batch ID was reused with different shard ordinals',
      )
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
        throw new ClassifierDecisionReuseError(
          'results',
          'Classifier decision batch ID was reused with different results',
        )
      }
    }
  }
}

function sameDecisionIdentity(
  existing: PersistedClassifierDecision,
  input: NormalizedClassifierDecisionInput,
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
