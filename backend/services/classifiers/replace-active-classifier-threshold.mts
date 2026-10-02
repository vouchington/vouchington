import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierThresholds } from '@voucha/types'
import {
  isSameClassifierThresholdOverride,
  validateClassifierThresholdOverride,
  type ClassifierThresholdOverride,
} from './threshold-validation.mts'
import { THRESHOLD_REVISION_FROM, THRESHOLD_REVISION_SELECT } from './threshold-revision-sql.mts'
import type {
  ClassifierThresholdChangeResult,
  ClassifierThresholdRevision,
} from './threshold-management-types.mts'

export type ClassifierThresholdChangeTarget =
  | { kind: 'set'; override: ClassifierThresholdOverride }
  | { kind: 'rollback'; revisionId: string }

type LockedCandidate = {
  prompt_version_id: string | null
  default_lower: number | null
  default_upper: number | null
}

type StoredOverride = { id: string; lower: number | null; upper: number | null }

/**
 * Replaces a candidate's active threshold revision for the classifier's active prompt version. The
 * candidate row is locked first, so concurrent staff changes (and decision snapshots, which share
 * the lock) serialize. The prior revision is deactivated and a NEW revision is inserted in the same
 * transaction, which is what keeps exactly one active revision for every captured candidate.
 */
export async function replaceActiveClassifierThreshold(
  transaction: OwnedTransaction,
  actorId: string,
  scope: { classifierId: string; candidateId: string },
  target: ClassifierThresholdChangeTarget,
): Promise<ClassifierThresholdChangeResult> {
  const { rows: locked } = await transaction<LockedCandidate>(
    `/* lockClassifierCandidateForThresholdChange */
    SELECT prompt.id AS prompt_version_id,
      prompt.default_lower_threshold::float8 AS default_lower,
      prompt.default_upper_threshold::float8 AS default_upper
    FROM classifier_candidates candidate
    JOIN classifiers classifier ON classifier.id = candidate.classifier_id
    LEFT JOIN classifier_prompt_versions prompt
      ON prompt.classifier_id = classifier.id
      AND prompt.activated_at IS NOT NULL
      AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
    WHERE candidate.id = $1
      AND candidate.classifier_id = $2
      AND candidate.deleted_at IS NULL
      AND classifier.deleted_at IS NULL
    FOR NO KEY UPDATE OF candidate`,
    [scope.candidateId, scope.classifierId],
  )
  const candidate = locked[0]
  if (!candidate) return { outcome: 'not_found' }
  if (candidate.prompt_version_id === null) {
    return { outcome: 'conflict', reason: 'Classifier has no active prompt version' }
  }
  const promptVersionId = candidate.prompt_version_id
  const defaults: ClassifierThresholds = {
    lower: candidate.default_lower!,
    upper: candidate.default_upper!,
  }

  const resolved = await resolveTargetOverride(transaction, scope, promptVersionId, target)
  if ('outcome' in resolved) return resolved
  const validation = validateClassifierThresholdOverride(resolved.override, defaults)
  if (!validation.valid) return { outcome: 'invalid', reason: validation.reason }

  const { rows: current } = await transaction<StoredOverride>(
    `/* readActiveClassifierThresholdForChange */
    SELECT id, lower_threshold_override::float8 AS lower, upper_threshold_override::float8 AS upper
    FROM classifier_candidate_thresholds
    WHERE candidate_id = $1 AND prompt_version_id = $2 AND deactivated_at IS NULL
    FOR UPDATE`,
    [scope.candidateId, promptVersionId],
  )
  const active = current[0]
  if (active && isSameClassifierThresholdOverride(active, resolved.override)) {
    return { outcome: 'unchanged', threshold: await readRevision(transaction, active.id) }
  }
  if (active) {
    await transaction(
      `/* deactivateClassifierCandidateThreshold */
      UPDATE classifier_candidate_thresholds
      SET deactivated_at = CURRENT_TIMESTAMP, deactivated_by_id = $2
      WHERE id = $1`,
      [active.id, actorId],
    )
  }
  const { rows: inserted } = await transaction<{ id: string }>(
    `/* insertClassifierCandidateThreshold */
    INSERT INTO classifier_candidate_thresholds (
      classifier_id, candidate_id, prompt_version_id, lower_threshold_override,
      upper_threshold_override, created_by_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
    [
      scope.classifierId,
      scope.candidateId,
      promptVersionId,
      resolved.override.lower,
      resolved.override.upper,
      actorId,
    ],
  )
  const threshold = await readRevision(transaction, inserted[0]!.id)
  await transaction.commit()
  return { outcome: 'changed', threshold }
}

/** A rollback re-applies a prior revision's values of the active prompt version as a new row. */
async function resolveTargetOverride(
  transaction: OwnedTransaction,
  scope: { classifierId: string; candidateId: string },
  promptVersionId: string,
  target: ClassifierThresholdChangeTarget,
): Promise<{ override: ClassifierThresholdOverride } | ClassifierThresholdChangeResult> {
  if (target.kind === 'set') return { override: target.override }
  const { rows } = await transaction<StoredOverride & { prompt_version_id: string }>(
    `/* readClassifierThresholdRollbackTarget */
    SELECT id, prompt_version_id, lower_threshold_override::float8 AS lower,
      upper_threshold_override::float8 AS upper
    FROM classifier_candidate_thresholds
    WHERE id = $1 AND candidate_id = $2 AND classifier_id = $3`,
    [target.revisionId, scope.candidateId, scope.classifierId],
  )
  const revision = rows[0]
  if (!revision) return { outcome: 'not_found' }
  if (revision.prompt_version_id !== promptVersionId) {
    return {
      outcome: 'conflict',
      reason: 'Revision belongs to an earlier prompt version, so it cannot be restored',
    }
  }
  return { override: { lower: revision.lower, upper: revision.upper } }
}

async function readRevision(
  transaction: OwnedTransaction,
  revisionId: string,
): Promise<ClassifierThresholdRevision> {
  const { rows } = await transaction<ClassifierThresholdRevision>(
    `/* readClassifierThresholdRevision */
    SELECT ${THRESHOLD_REVISION_SELECT}
    FROM ${THRESHOLD_REVISION_FROM}
    WHERE revision.id = $1`,
    [revisionId],
  )
  return rows[0]!
}
