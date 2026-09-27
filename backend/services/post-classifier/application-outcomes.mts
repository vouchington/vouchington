import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { persistClassifierDecision } from '@services/classifiers/persist-classifier-decision'
import type {
  PersistClassifierDecisionInput,
  PersistedClassifierDecision,
} from '@services/classifiers/types'
import sql from 'sql-template-strings'
import {
  applicationLeaseMatches,
  lockCurrentPostClassifierApplicationInput,
  lockPostClassifierApplication,
  type PostClassifierApplicationLease,
} from './application-identity.mts'
import { assertRemoteInputCandidates } from './application-input-validation.mts'

export type PostClassifierLocalOutcome = {
  flagged: boolean
  reason: string
  confidenceScore: number
  confidenceThreshold: number
  classification: 'ai' | 'human'
  detector: string
  detectorModelVersion: string
}

export type PersistPostClassifierOutcomesInput = {
  lease: PostClassifierApplicationLease
  localOutcome?: PostClassifierLocalOutcome
  remoteDecision?: PersistClassifierDecisionInput
}

export async function persistPostClassifierOutcomes(
  input: PersistPostClassifierOutcomesInput,
): Promise<'persisted' | 'replay' | 'stale'> {
  await using query = await beginTransaction()
  const result = await persistPostClassifierOutcomesWithQuery(query, input)
  if (result !== 'stale') await query.commit()
  return result
}

export async function persistPostClassifierOutcomesWithQuery(
  query: OwnedTransaction,
  input: PersistPostClassifierOutcomesInput,
): Promise<'persisted' | 'replay' | 'stale'> {
  const { lease } = input
  if (!(await lockCurrentPostClassifierApplicationInput(query, lease))) return 'stale'
  const row = await lockPostClassifierApplication(query, lease)
  if (!applicationLeaseMatches(row, lease)) return 'stale'
  if (row.outcomes_persisted_at) return 'replay'
  assertLocalOutcome(lease, input.localOutcome)

  let committedBatchId: string | null = null
  if (lease.reservedBatchId === null) {
    if (input.remoteDecision)
      throw new Error('Local-only classifier application cannot persist remote output')
  } else {
    if (!input.remoteDecision)
      throw new Error('Remote classifier application requires a complete remote output')
    assertRemoteInputIdentity(lease, input.remoteDecision)
    assertRemoteInputCandidates(lease, input.remoteDecision)
    const persisted = await persistClassifierDecision(input.remoteDecision, { query })
    assertPersistedDecisionMatchesConfiguration(lease, persisted.decision)
    committedBatchId = persisted.decision.batchId
  }

  await query(sql`/* persistPostClassifierApplicationOutcomes */
    UPDATE post_classifier_applications
    SET committed_batch_id = ${committedBatchId},
      local_flagged = ${input.localOutcome?.flagged ?? null},
      local_reason = ${input.localOutcome?.reason ?? null},
      local_confidence_score = ${input.localOutcome?.confidenceScore ?? null},
      local_confidence_threshold = ${input.localOutcome?.confidenceThreshold ?? null},
      local_classification = ${input.localOutcome?.classification ?? null},
      local_detector = ${input.localOutcome?.detector ?? null},
      local_detector_model_version = ${input.localOutcome?.detectorModelVersion ?? null},
      outcomes_persisted_at = clock_timestamp()
    WHERE post_id = ${lease.postId} AND id = ${lease.applicationId}
  `)
  return 'persisted'
}

export function assertPersistedDecisionMatchesConfiguration(
  lease: PostClassifierApplicationLease,
  decision: PersistedClassifierDecision,
): void {
  const remote = lease.resolved.configuration.remote
  if (!remote || lease.reservedBatchId === null) {
    throw new Error('Local-only classifier application cannot have a persisted remote decision')
  }
  if (
    decision.batchId !== lease.reservedBatchId ||
    decision.classifierId !== remote.classifierId ||
    decision.promptVersionId !== remote.promptVersionId ||
    decision.subject.postId !== lease.postId ||
    decision.subject.rssFeedItemId !== null ||
    decision.scope.scopeCategory !== 'global' ||
    decision.scope.scopeCommunityId !== null
  ) {
    throw new Error('post classifier remote decision identity does not match its receipt')
  }
  const expected = new Map(
    remote.questions.map(question => [`${question.topicId}:${question.candidateId}`, question]),
  )
  if (decision.results.length !== expected.size || decision.calls.length !== 1) {
    throw new Error(
      'post classifier remote decision does not cover its exact configured candidates',
    )
  }
  const callIds = new Set(decision.calls.map(call => call.id))
  const seen = new Set<string>()
  for (const result of decision.results) {
    if (result.candidateKind !== 'topic') {
      throw new Error('post classifier remote decision contains a non-topic result')
    }
    const key = `${result.topicId}:${result.storedCandidateId ?? ''}`
    const question = expected.get(key)
    if (
      !question ||
      seen.has(key) ||
      !callIds.has(result.decisionCallId) ||
      result.batchId !== decision.batchId ||
      result.classifierId !== remote.classifierId ||
      result.promptVersionId !== remote.promptVersionId ||
      result.thresholdId !== question.thresholdId ||
      result.effectiveThresholds.lower !== question.lower ||
      result.effectiveThresholds.upper !== question.upper ||
      result.scope.scopeCategory !== 'global' ||
      result.scope.scopeCommunityId !== null
    ) {
      throw new Error('post classifier remote decision lineage does not match its receipt')
    }
    seen.add(key)
  }
}

function assertLocalOutcome(
  lease: PostClassifierApplicationLease,
  outcome: PostClassifierLocalOutcome | undefined,
): void {
  const local = lease.resolved.configuration.local
  if (!local) {
    if (outcome) throw new Error('post classifier local outcome is not enabled by its receipt')
    return
  }
  if (!outcome) throw new Error('post classifier local outcome is required by its receipt')
  if (
    !Number.isFinite(outcome.confidenceScore) ||
    outcome.confidenceScore < 0 ||
    outcome.confidenceScore > 1 ||
    outcome.confidenceThreshold !== local.confidenceThreshold ||
    !outcome.reason ||
    !outcome.detector ||
    !outcome.detectorModelVersion
  ) {
    throw new Error('post classifier local outcome does not match its receipt')
  }
}

function assertRemoteInputIdentity(
  lease: PostClassifierApplicationLease,
  decision: PersistClassifierDecisionInput,
): void {
  const remote = lease.resolved.configuration.remote
  if (
    !remote ||
    decision.batchId !== lease.reservedBatchId ||
    decision.classifierId !== remote.classifierId ||
    decision.promptVersionId !== remote.promptVersionId ||
    decision.subject.postId !== lease.postId ||
    decision.subject.rssFeedItemId !== null ||
    decision.scope.scopeCategory !== 'global' ||
    decision.scope.scopeCommunityId !== null
  ) {
    throw new Error('post classifier remote input does not match its receipt')
  }
}
