import { beginTransaction } from '@data-stores/psql'
import {
  replaceActiveClassifierThreshold,
  type ClassifierThresholdChangeTarget,
} from './replace-active-classifier-threshold.mts'
import type { ClassifierThresholdOverride } from './threshold-validation.mts'
import type { ClassifierThresholdChangeResult } from './threshold-management-types.mts'

export type ClassifierCandidateScope = { classifierId: string; candidateId: string }

/**
 * Sets (or, with both bounds null, clears) a candidate's threshold override for the classifier's
 * active prompt version. The change is a new revision attributed to `actorId`; the prior revision
 * is deactivated by the same actor. Setting the values already in force writes nothing.
 */
export function setClassifierCandidateThreshold(
  actorId: string,
  scope: ClassifierCandidateScope,
  override: ClassifierThresholdOverride,
): Promise<ClassifierThresholdChangeResult> {
  return changeClassifierCandidateThreshold(actorId, scope, { kind: 'set', override })
}

/**
 * Re-activates an earlier revision's values as a NEW revision, so history is never rewritten and
 * the restore itself is attributed to `actorId`. Only revisions of the active prompt version apply.
 */
export function rollbackClassifierCandidateThreshold(
  actorId: string,
  scope: ClassifierCandidateScope,
  revisionId: string,
): Promise<ClassifierThresholdChangeResult> {
  return changeClassifierCandidateThreshold(actorId, scope, { kind: 'rollback', revisionId })
}

async function changeClassifierCandidateThreshold(
  actorId: string,
  scope: ClassifierCandidateScope,
  target: ClassifierThresholdChangeTarget,
): Promise<ClassifierThresholdChangeResult> {
  await using transaction = await beginTransaction()
  return await replaceActiveClassifierThreshold(transaction, actorId, scope, target)
}
