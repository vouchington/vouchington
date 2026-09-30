import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostClassifierApplicationLease } from './application-identity.mts'

export type PostClassifierLocalOutcome = {
  flagged: boolean
  reason: string
  confidenceScore: number
  confidenceThreshold: number
  classification: 'ai' | 'human'
  detector: string
  detectorModelVersion: string
}

/** Rejects a local detector result that its receipt configuration did not ask for or pin. */
export function assertLocalOutcome(
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

/** The seven `local_*` assignments of one atomic all-null or all-set local detector outcome. */
export function localOutcomeAssignments(
  outcome: PostClassifierLocalOutcome | undefined,
): SQLStatement {
  return sql`local_flagged = ${outcome?.flagged ?? null},
      local_reason = ${outcome?.reason ?? null},
      local_confidence_score = ${outcome?.confidenceScore ?? null},
      local_confidence_threshold = ${outcome?.confidenceThreshold ?? null},
      local_classification = ${outcome?.classification ?? null},
      local_detector = ${outcome?.detector ?? null},
      local_detector_model_version = ${outcome?.detectorModelVersion ?? null}`
}
