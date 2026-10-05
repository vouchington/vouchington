import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import type { ClassifierRunLease } from '@services/classifier-runs'
import sql from 'sql-template-strings'
import type { PostClassifierConfiguration } from './run-configuration.mts'

export type PostClassifierLocalOutcome = {
  is_flagged: boolean
  reason: string
  confidenceScore: number
  confidenceThreshold: number
  classification: 'ai' | 'human'
  detector: string
  detectorModelVersion: string
}

type LocalOutcomeRow = {
  is_flagged: boolean
  reason: string
  confidence_score: number
  confidence_threshold: number
  classification: 'ai' | 'human'
  detector: string
  detector_model_version: string
}

/** Rejects a local detector result that its run configuration did not ask for or pin. */
export function validatePostClassifierLocal(
  configuration: PostClassifierConfiguration,
  outcome: PostClassifierLocalOutcome | undefined,
): void {
  const local = configuration.local
  if (!local) {
    if (outcome) throw new Error('post classifier local outcome is not enabled by its run')
    return
  }
  if (!outcome) throw new Error('post classifier local outcome is required by its run')
  if (
    !Number.isFinite(outcome.confidenceScore) ||
    outcome.confidenceScore < 0 ||
    outcome.confidenceScore > 1 ||
    outcome.confidenceThreshold !== local.confidenceThreshold ||
    !outcome.reason ||
    !outcome.detector ||
    !outcome.detectorModelVersion
  ) {
    throw new Error('post classifier local outcome does not match its run')
  }
}

/** Insert-only: a run keeps exactly one local outcome, whichever terminal or success path wrote it. */
export async function persistPostClassifierLocalOutcome(
  query: OwnedTransaction,
  lease: ClassifierRunLease<PostClassifierConfiguration>,
  outcome: PostClassifierLocalOutcome,
): Promise<void> {
  const local = lease.resolved.configuration.local
  if (!local) throw new Error('post classifier local outcome is not enabled by its run')
  await query(sql`/* persistPostClassifierLocalOutcome */
    INSERT INTO post_classifier_local_outcomes (
      run_id, local_topic_id, is_flagged, reason, confidence_score, confidence_threshold,
      classification, detector, detector_model_version
    ) VALUES (
      ${lease.runId}, ${local.topicId}, ${outcome.is_flagged}, ${outcome.reason},
      ${outcome.confidenceScore}, ${outcome.confidenceThreshold}, ${outcome.classification},
      ${outcome.detector}, ${outcome.detectorModelVersion}
    )
  `)
}

export async function readPostClassifierLocalOutcome(
  query: QueryExecutor,
  runId: string,
): Promise<PostClassifierLocalOutcome | null> {
  const { rows } = await query<LocalOutcomeRow>(sql`/* readPostClassifierLocalOutcome */
    SELECT is_flagged, reason, confidence_score, confidence_threshold, classification, detector,
      detector_model_version
    FROM post_classifier_local_outcomes WHERE run_id = ${runId}
  `)
  const row = rows[0]
  if (!row) return null
  return {
    is_flagged: row.is_flagged,
    reason: row.reason,
    confidenceScore: row.confidence_score,
    confidenceThreshold: row.confidence_threshold,
    classification: row.classification,
    detector: row.detector,
    detectorModelVersion: row.detector_model_version,
  }
}
