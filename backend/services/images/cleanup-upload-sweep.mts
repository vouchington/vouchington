import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AbandonedUploadSweep, UploadCleanupPhase } from '@queues/content-analysis/types'
import { getImagesWorkLimit } from './work-limits.mts'
import { captureUploadCleanupUpper } from './cleanup-upload-queries.mts'

export const UPLOAD_CLEANUP_PHASES = ['staged', 'recovery', 'abandonment'] as const

/** Capture only: scheduling a new sweep never mutates an image or contacts a provider. */
export async function initializeAbandonedUploadSweep(): Promise<AbandonedUploadSweep> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ recovery_cutoff: string; abandonment_cutoff: string }>(sql`
    /* initializeAbandonedUploadSweep */
    SELECT to_char((CURRENT_TIMESTAMP - ${getImagesWorkLimit('recovery_threshold_hours')} * interval '1 hour')
      AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recovery_cutoff,
      to_char((CURRENT_TIMESTAMP - ${getImagesWorkLimit('abandoned_threshold_hours')} * interval '1 hour')
      AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS abandonment_cutoff`)
  const clock = rows[0]
  if (!clock) throw new Error('Upload cleanup clock unavailable')
  const cutoffs = {
    recoveryCutoff: clock.recovery_cutoff,
    abandonmentCutoff: clock.abandonment_cutoff,
  }
  const [staged, recovery, abandonment] = await Promise.all([
    captureUploadCleanupUpper(transaction, 'staged', cutoffs.recoveryCutoff),
    captureUploadCleanupUpper(transaction, 'recovery', cutoffs.recoveryCutoff),
    captureUploadCleanupUpper(transaction, 'abandonment', cutoffs.abandonmentCutoff),
  ])
  await transaction.commit()
  return {
    ...cutoffs,
    windows: {
      staged: { upper: staged, done: staged === null },
      recovery: { upper: recovery, done: recovery === null },
      abandonment: { upper: abandonment, done: abandonment === null },
    },
  }
}

export function uploadCleanupCutoff(
  sweep: AbandonedUploadSweep,
  phase: UploadCleanupPhase,
): string {
  return phase === 'abandonment' ? sweep.abandonmentCutoff : sweep.recoveryCutoff
}

/** Keep deadline construction shared by the worker and native retained-job contract. */
export function getUploadCleanupResumeAt(backpressured: boolean, now: () => number = Date.now) {
  return backpressured ? now() + getImagesWorkLimit('recovery_backoff_ms') : undefined
}
