import { recordCopyrightRetentionErasureFailure } from '@modules/on-error'
import { sweepCopyrightEvidenceRetention } from '@services/copyright-notices'

export type SweepCopyrightEvidenceRetentionDeps = {
  sweep: typeof sweepCopyrightEvidenceRetention
  recordFailure: typeof recordCopyrightRetentionErasureFailure
}

const defaultDeps: SweepCopyrightEvidenceRetentionDeps = {
  sweep: sweepCopyrightEvidenceRetention,
  recordFailure: recordCopyrightRetentionErasureFailure,
}

/**
 * Erases the evidence and personal data of copyright cases whose retention period has run out,
 * a bounded batch per run. The service reads `copyright.evidenceRetentionDeletion` and
 * `copyright.evidenceRetentionDays` first and deletes nothing while the switch is off or the
 * period is unset. Cases it could not erase (the evidence bucket refused a delete, a lock timed
 * out) stay untouched for the next run and are reported to Sentry by count and notice id only, so
 * the job itself succeeds and the queue does not retry a run that already did its work. The job
 * data is always `{}`, so the first argument only carries test overrides.
 */
export async function processSweepCopyrightEvidenceRetention(
  dependencyOverrides: Partial<SweepCopyrightEvidenceRetentionDeps> = {},
): Promise<{ erased: number; ineligible: number; failed: number }> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const { erased, ineligible, failed } = await deps.sweep()
  deps.recordFailure({ erased, failed })
  return { erased, ineligible, failed: failed.length }
}
