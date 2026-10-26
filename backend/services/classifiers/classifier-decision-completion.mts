import type { OwnedTransaction } from '@data-stores/psql'
import { readPersistedClassifierDecision } from './classifier-decision-readback.mts'
import { completeClassifierDecisionBatch } from './classifier-decision-batch-lifecycle.mts'
import {
  assertCompletePersistence,
  assertExistingDecisionMatchesInput,
} from './classifier-decision-persistence-validation.mts'
import {
  insertClassifierDecisionCalls,
  captureClassifierDecisionStoredCandidateSnapshots,
} from './write-decision-lineage.mts'
import { insertClassifierDecisionResults } from './write-decision-results.mts'
import {
  classifierDecisionCandidateKind,
  normalizeClassifierDecisionInput,
} from './decision-input.mts'
import type { PersistClassifierDecisionResult } from './types.mts'

export async function persistAndCompleteClassifierDecision(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
  calls: Awaited<ReturnType<typeof insertClassifierDecisionCalls>>,
  snapshots: Awaited<ReturnType<typeof captureClassifierDecisionStoredCandidateSnapshots>>,
  thresholds: { lower: number; upper: number },
  inputSha256: Buffer,
  activeRunId?: string,
): Promise<PersistClassifierDecisionResult> {
  const resultCount = await insertClassifierDecisionResults(
    query,
    normalizedInput,
    calls,
    snapshots,
    thresholds,
    candidateKind,
  )
  assertCompletePersistence(normalizedInput, calls.length, snapshots.size, resultCount)
  await completeClassifierDecisionBatch(query, normalizedInput.batchId, inputSha256)
  const decision = await readPersistedClassifierDecision(
    query,
    normalizedInput.batchId,
    candidateKind,
    activeRunId,
  )
  assertExistingDecisionMatchesInput(decision, normalizedInput)
  return { decision, replayed: false }
}
