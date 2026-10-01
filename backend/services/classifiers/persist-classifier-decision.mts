import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import {
  classifierDecisionCandidateKind,
  normalizeClassifierDecisionInput,
} from './decision-input.mts'
import { readCompleteClassifierDecision } from './read-complete-decision.mts'
import {
  completeClassifierDecisionBatch,
  lockClassifierDecisionBatch,
  readClassifierDecisionStoredCandidateSnapshots,
} from './classifier-decision-batch-lifecycle.mts'
import type { PersistClassifierDecisionInput, PersistClassifierDecisionResult } from './types.mts'
import {
  assertBatchMatchesInput,
  assertCandidateKindMatchesSubject,
  assertCompletePersistence,
  assertExistingDecisionMatchesInput,
  assertReservedSnapshotsMatchInput,
  storedCandidateIds,
} from './classifier-decision-persistence-validation.mts'
import {
  captureClassifierDecisionStoredCandidateSnapshots,
  insertClassifierDecisionBatch,
  insertClassifierDecisionCalls,
  loadClassifierDecisionPromptThresholds,
  loadReservedClassifierDecisionPromptThresholds,
} from './write-decision-lineage.mts'
import { insertClassifierDecisionResults } from './write-decision-results.mts'

export async function persistClassifierDecision(
  input: PersistClassifierDecisionInput,
  options: { query?: OwnedTransaction } = {},
): Promise<PersistClassifierDecisionResult> {
  const normalizedInput = normalizeClassifierDecisionInput(input)
  const candidateKind = classifierDecisionCandidateKind(normalizedInput)
  if (options.query) {
    return persistClassifierDecisionWithQuery(options.query, normalizedInput, candidateKind)
  }
  await using transaction = await beginTransaction()
  const result = await persistClassifierDecisionWithQuery(
    transaction,
    normalizedInput,
    candidateKind,
  )
  await transaction.commit()
  return result
}

async function persistClassifierDecisionWithQuery(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
): Promise<PersistClassifierDecisionResult> {
  const inserted = await insertClassifierDecisionBatch(query, normalizedInput)
  if (!inserted) {
    const batch = await lockClassifierDecisionBatch(query, normalizedInput.batchId)
    if (!batch) throw new Error('Classifier decision batch disappeared while persisting')
    assertBatchMatchesInput(batch, normalizedInput)
    if (batch.completedAt !== null) {
      const decision = await readCompleteClassifierDecision(
        query,
        normalizedInput.batchId,
        candidateKind,
      )
      assertExistingDecisionMatchesInput(decision, normalizedInput)
      return { decision, replayed: true }
    }
    return completeReservedClassifierDecision(query, normalizedInput, candidateKind)
  }

  return persistNewClassifierDecision(query, normalizedInput, candidateKind)
}

async function persistNewClassifierDecision(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
): Promise<PersistClassifierDecisionResult> {
  const configuration = await loadClassifierDecisionPromptThresholds(query, normalizedInput)
  assertCandidateKindMatchesSubject(
    configuration.candidateKind,
    candidateKind,
    normalizedInput.subject,
    normalizedInput.scope,
  )
  const [snapshots, calls] = await Promise.all([
    captureClassifierDecisionStoredCandidateSnapshots(query, {
      batchId: normalizedInput.batchId,
      classifierId: normalizedInput.classifierId,
      promptVersionId: normalizedInput.promptVersionId,
      candidateKind,
      storedCandidateIds: storedCandidateIds(normalizedInput),
    }),
    insertClassifierDecisionCalls(query, normalizedInput),
  ])
  return persistAndCompleteClassifierDecision(
    query,
    normalizedInput,
    candidateKind,
    calls,
    snapshots,
    configuration.thresholds,
  )
}

async function completeReservedClassifierDecision(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
): Promise<PersistClassifierDecisionResult> {
  const configuration = await loadReservedClassifierDecisionPromptThresholds(query, normalizedInput)
  assertCandidateKindMatchesSubject(
    configuration.candidateKind,
    candidateKind,
    normalizedInput.subject,
    normalizedInput.scope,
  )
  const snapshots = await readClassifierDecisionStoredCandidateSnapshots(
    query,
    normalizedInput.batchId,
  )
  assertReservedSnapshotsMatchInput(snapshots, normalizedInput)
  const calls = await insertClassifierDecisionCalls(query, normalizedInput)
  return persistAndCompleteClassifierDecision(
    query,
    normalizedInput,
    candidateKind,
    calls,
    snapshots,
    configuration.thresholds,
  )
}

async function persistAndCompleteClassifierDecision(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
  calls: Awaited<ReturnType<typeof insertClassifierDecisionCalls>>,
  snapshots: Awaited<ReturnType<typeof captureClassifierDecisionStoredCandidateSnapshots>>,
  thresholds: { lower: number; upper: number },
): Promise<PersistClassifierDecisionResult> {
  const resultCount = await insertClassifierDecisionResults(
    query,
    normalizedInput,
    calls,
    snapshots,
    thresholds,
  )
  assertCompletePersistence(normalizedInput, calls.length, snapshots.size, resultCount)
  await completeClassifierDecisionBatch(query, normalizedInput.batchId)
  const decision = await readCompleteClassifierDecision(
    query,
    normalizedInput.batchId,
    candidateKind,
  )
  assertExistingDecisionMatchesInput(decision, normalizedInput)
  return { decision, replayed: false }
}
