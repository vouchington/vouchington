import {
  readInactiveClassifierTopicIds,
  omitInactiveTopicInput,
  omitInactiveTopicDecision,
} from './inactive-topic-results.mts'
import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import {
  classifierDecisionCandidateKind,
  classifierDecisionInputFingerprint,
  normalizeClassifierDecisionInput,
} from './decision-input.mts'
import { readPersistedClassifierDecision } from './classifier-decision-readback.mts'
import { insertClassifierDecisionBatch } from './classifier-decision-batch-insert.mts'
import { persistAndCompleteClassifierDecision } from './classifier-decision-completion.mts'
import {
  lockClassifierDecisionBatch,
  readClassifierDecisionStoredCandidateSnapshots,
} from './classifier-decision-batch-lifecycle.mts'
import type { PersistClassifierDecisionInput, PersistClassifierDecisionResult } from './types.mts'
import {
  assertBatchMatchesInput,
  assertBatchInputFingerprintMatches,
  assertCandidateKindMatchesSubject,
  assertExistingDecisionMatchesInput,
  assertReservedSnapshotsMatchInput,
  storedCandidateIds,
} from './classifier-decision-persistence-validation.mts'
import {
  captureClassifierDecisionStoredCandidateSnapshots,
  insertClassifierDecisionCalls,
  loadClassifierDecisionPromptThresholds,
  loadReservedClassifierDecisionPromptThresholds,
} from './write-decision-lineage.mts'

export async function persistClassifierDecision(
  input: PersistClassifierDecisionInput,
  options: { query?: OwnedTransaction; activeRunId?: string } = {},
): Promise<PersistClassifierDecisionResult> {
  const normalizedInput = normalizeClassifierDecisionInput(input)
  const candidateKind = classifierDecisionCandidateKind(normalizedInput)
  if (options.query) {
    return persistClassifierDecisionWithQuery(
      options.query,
      normalizedInput,
      candidateKind,
      options.activeRunId,
    )
  }
  await using transaction = await beginTransaction()
  const result = await persistClassifierDecisionWithQuery(
    transaction,
    normalizedInput,
    candidateKind,
    options.activeRunId,
  )
  await transaction.commit()
  return result
}

async function persistClassifierDecisionWithQuery(
  query: OwnedTransaction,
  originalInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
  activeRunId?: string,
): Promise<PersistClassifierDecisionResult> {
  const inactive = await readInactiveClassifierTopicIds(
    query,
    originalInput.calls.flatMap(call =>
      call.results.flatMap(result => (result.candidateKind === 'topic' ? [result.topicId] : [])),
    ),
    // Soft-deleted identities may be restored: retain their decision lineage, skip only effects.
    false,
  )
  const inputSha256 = classifierDecisionInputFingerprint(originalInput)
  const normalizedInput = omitInactiveTopicInput(originalInput, inactive)
  const inserted = await insertClassifierDecisionBatch(query, normalizedInput, activeRunId)
  if (!inserted) {
    const batch = await lockClassifierDecisionBatch(query, normalizedInput.batchId)
    if (!batch) throw new Error('Classifier decision batch disappeared while persisting')
    assertBatchMatchesInput(batch, normalizedInput)
    if (batch.completedAt !== null) {
      assertBatchInputFingerprintMatches(batch, inputSha256)
      const storedDecision = await readPersistedClassifierDecision(
        query,
        normalizedInput.batchId,
        candidateKind,
        activeRunId,
      )
      const decision = omitInactiveTopicDecision(storedDecision, inactive)
      assertExistingDecisionMatchesInput(decision, normalizedInput)
      return { decision, replayed: true }
    }
    return completeReservedClassifierDecision(
      query,
      normalizedInput,
      candidateKind,
      originalInput,
      inputSha256,
      activeRunId,
    )
  }

  return persistNewClassifierDecision(
    query,
    normalizedInput,
    candidateKind,
    inputSha256,
    activeRunId,
  )
}

async function persistNewClassifierDecision(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
  inputSha256: Buffer,
  activeRunId?: string,
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
    inputSha256,
    activeRunId,
  )
}

async function completeReservedClassifierDecision(
  query: OwnedTransaction,
  normalizedInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  candidateKind: ReturnType<typeof classifierDecisionCandidateKind>,
  originalInput: ReturnType<typeof normalizeClassifierDecisionInput>,
  inputSha256: Buffer,
  activeRunId?: string,
): Promise<PersistClassifierDecisionResult> {
  const configuration = await loadReservedClassifierDecisionPromptThresholds(query, normalizedInput)
  assertCandidateKindMatchesSubject(
    configuration.candidateKind,
    candidateKind,
    normalizedInput.subject,
    normalizedInput.scope,
  )
  const capturedSnapshots = await readClassifierDecisionStoredCandidateSnapshots(
    query,
    normalizedInput.batchId,
  )
  const activeIds = new Set(storedCandidateIds(normalizedInput))
  const skippedIds = new Set(storedCandidateIds(originalInput).filter(id => !activeIds.has(id)))
  const snapshots = new Map([...capturedSnapshots].filter(([id]) => !skippedIds.has(id)))
  assertReservedSnapshotsMatchInput(snapshots, normalizedInput)
  const calls = await insertClassifierDecisionCalls(query, normalizedInput)
  return persistAndCompleteClassifierDecision(
    query,
    normalizedInput,
    candidateKind,
    calls,
    snapshots,
    configuration.thresholds,
    inputSha256,
    activeRunId,
  )
}
