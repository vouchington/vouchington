import { write, type QueryExecutor } from '@data-stores/psql'
import {
  readCompleteClassifierDecision,
  readCompleteClassifierDecisionIfExistsFromPrimary,
} from '@services/classifiers/read-complete-decision'
import type { PersistedClassifierDecision } from '@services/classifiers/types'
import sql from 'sql-template-strings'
import { assertPersistedDecisionMatchesConfiguration } from './application-outcomes.mts'
import type { PostClassifierLocalOutcome } from './application-local-outcome.mts'
import type { PostClassifierApplicationLease } from './application-identity.mts'

type OutcomeRow = {
  input_sha256: Buffer
  configuration_json: string
  configuration_sha256: Buffer
  shared_actor_id: string
  decision_batch_id: string | null
  outcomes_persisted_at: Date | null
  local_flagged: boolean | null
  local_reason: string | null
  local_confidence_score: number | null
  local_confidence_threshold: number | null
  local_classification: 'ai' | 'human' | null
  local_detector: string | null
  local_detector_model_version: string | null
}

export type PostClassifierRecoveredOutcomes = {
  localOutcome: PostClassifierLocalOutcome | null
  remoteDecision: PersistedClassifierDecision | null
}

export async function readPostClassifierOutcomes(
  lease: PostClassifierApplicationLease,
  options: { query?: QueryExecutor } = {},
): Promise<PostClassifierRecoveredOutcomes | null> {
  const query = options.query ?? write
  const { rows } = await query<OutcomeRow>(sql`/* readPostClassifierApplicationOutcomes */
    SELECT input_sha256, configuration_json::text AS configuration_json, configuration_sha256, shared_actor_id,
      decision_batch_id, outcomes_persisted_at,
      local_flagged, local_reason, local_confidence_score, local_confidence_threshold,
      local_classification, local_detector, local_detector_model_version
    FROM post_classifier_applications
    WHERE post_id = ${lease.postId} AND id = ${lease.applicationId}
  `)
  const row = rows[0]
  if (!row || !row.outcomes_persisted_at || !matchesLeaseIdentity(row, lease)) return null
  const localOutcome = toLocalOutcome(row)
  if ((lease.resolved.configuration.local === null) !== (localOutcome === null)) {
    throw new Error('post classifier receipt local outcome does not match its configuration')
  }
  if (row.decision_batch_id === null) {
    return { localOutcome, remoteDecision: null }
  }
  const remoteDecision = options.query
    ? await readCompleteClassifierDecision(options.query, row.decision_batch_id, 'topic')
    : await readCompleteClassifierDecisionIfExistsFromPrimary(row.decision_batch_id, 'topic')
  if (!remoteDecision) throw new Error('post classifier receipt lost its committed remote decision')
  assertPersistedDecisionMatchesConfiguration(lease, remoteDecision)
  return { localOutcome, remoteDecision }
}

function matchesLeaseIdentity(row: OutcomeRow, lease: PostClassifierApplicationLease): boolean {
  return (
    row.input_sha256.equals(lease.inputSha256) &&
    row.configuration_sha256.equals(lease.resolved.configurationSha256) &&
    row.configuration_json === lease.resolved.configurationJson &&
    row.shared_actor_id === lease.resolved.configuration.actorId &&
    row.decision_batch_id === lease.decisionBatchId
  )
}

function toLocalOutcome(row: OutcomeRow): PostClassifierLocalOutcome | null {
  if (
    row.local_flagged === null ||
    row.local_reason === null ||
    row.local_confidence_score === null ||
    row.local_confidence_threshold === null ||
    row.local_classification === null ||
    row.local_detector === null ||
    row.local_detector_model_version === null
  ) {
    return null
  }
  return {
    flagged: row.local_flagged,
    reason: row.local_reason,
    confidenceScore: row.local_confidence_score,
    confidenceThreshold: row.local_confidence_threshold,
    classification: row.local_classification,
    detector: row.local_detector,
    detectorModelVersion: row.local_detector_model_version,
  }
}
