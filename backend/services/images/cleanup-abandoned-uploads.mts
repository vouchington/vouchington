import { getImagesWorkLimit } from './work-limits.mts'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { markImageUploadSourcesDeleted } from './complete-upload-state.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'
import { deleteKnownImageStorageFromS3 } from './s3-upload-lifecycle.mts'
import { createExtractImageMetadataEnqueue } from '@queues/image-uploads/enqueues'
import { imageUploadsQueue } from '@queues/image-uploads/queues'
import type { AbandonedUploadSweep, UploadCleanupPhase } from '@queues/content-analysis/types'
import { readUploadCleanupPage, type UploadCleanupRow } from './cleanup-upload-queries.mts'
import { UPLOAD_CLEANUP_PHASES, uploadCleanupCutoff } from './cleanup-upload-sweep.mts'

const STAGED_SOURCE_CLEANUP_CONCURRENCY = 4
const ABANDONED_UPLOAD_ERROR = 'Upload abandoned before completion'

/** One bounded pass; the caller persists each completed phase before another phase starts. */
export async function cleanupAbandonedUploads(
  sweep: AbandonedUploadSweep,
  save: (sweep: AbandonedUploadSweep) => Promise<void>,
  dependencies: {
    recoveryQueue?: typeof imageUploadsQueue
    acknowledgementQuery?: QueryExecutor
  } = {},
) {
  const batchSize = getImagesWorkLimit('cleanup_batch_size')
  const enqueueRecovery = createExtractImageMetadataEnqueue(
    dependencies.recoveryQueue ?? imageUploadsQueue,
  )
  let state = sweep
  const counts = { cleaned: 0, recovered: 0, stagedSourcesDeleted: 0 }
  for (const phase of UPLOAD_CLEANUP_PHASES) {
    if (state.windows[phase].done) continue
    // oxlint-disable-next-line no-await-in-loop -- phase order preserves source cleanup before recovery and abandonment
    const page = await readPhase(state, phase, batchSize) // no-mistakes-disable-line query-reached-per-item: three fixed phases use bounded transactions and ordered checkpoints
    const rows = page.slice(0, batchSize)
    if (phase === 'staged') {
      for (let offset = 0; offset < rows.length; offset += STAGED_SOURCE_CLEANUP_CONCURRENCY) {
        // oxlint-disable-next-line no-await-in-loop -- cap dedicated advisory-lock sessions per process
        const results = await Promise.allSettled(
          rows
            .slice(offset, offset + STAGED_SOURCE_CLEANUP_CONCURRENCY)
            .map(image => cleanupStagedUploadSource(image.id, dependencies.acknowledgementQuery)),
        )
        rejectFailedPageEffects(results)
        // A known provider failure stays dirty for the next sweep without starving later keys.
        counts.stagedSourcesDeleted += results.filter(
          result => result.status === 'fulfilled' && result.value,
        ).length
      }
    } else if (phase === 'recovery') {
      // A rejection prevents checkpointing. A deduplicated admission already has live extraction work.
      // oxlint-disable-next-line no-await-in-loop -- checkpoint only after the bounded fan-out settles
      const admissions = await Promise.allSettled(rows.map(image => enqueueRecovery(image.id)))
      rejectFailedPageEffects(admissions)
      counts.recovered += rows.length
    } else {
      // oxlint-disable-next-line no-await-in-loop -- retain best-effort per-image storage deletion after the committed soft delete
      const deletions = await Promise.allSettled(rows.map(deleteAbandonedStorage))
      rejectFailedPageEffects(deletions)
      const deletedIds = deletions.flatMap(result =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      )
      // oxlint-disable-next-line no-await-in-loop -- acknowledge one successful bounded phase before checkpointing
      await markImageUploadSourcesDeleted(deletedIds, { query: dependencies.acknowledgementQuery }) // no-mistakes-disable-line query-reached-per-item: one bounded acknowledgement batch per fixed phase preserves checkpoint ordering
      counts.cleaned += rows.length
    }
    const last = rows.at(-1)
    state = {
      recoveryCutoff: state.recoveryCutoff,
      abandonmentCutoff: state.abandonmentCutoff,
      windows: {
        ...state.windows,
        [phase]: {
          ...state.windows[phase],
          ...(last ? { after: { id: last.id, stagedAt: last.staged_at } } : {}),
          done: page.length <= batchSize,
        },
      },
    }
    // oxlint-disable-next-line no-await-in-loop -- durable progress follows effects, never the lookahead witness
    await save(state)
  }
  return {
    ...counts,
    hasMore: UPLOAD_CLEANUP_PHASES.some(phase => !state.windows[phase].done),
  }
}

async function readPhase(
  sweep: AbandonedUploadSweep,
  phase: UploadCleanupPhase,
  batchSize: number,
) {
  await using transaction = await beginTransaction()
  const page = await readUploadCleanupPage(
    transaction,
    phase,
    uploadCleanupCutoff(sweep, phase),
    sweep.windows[phase],
    batchSize,
  )
  if (phase === 'abandonment' && page.length) {
    // The locked lookahead row is not changed. Only the bounded applied page is committed.
    const ids = page.slice(0, batchSize).map(image => image.id)
    await transaction(sql`/* cleanupAbandonedUploads:abandonment */
      WITH candidates AS (
        SELECT id FROM images WHERE id = ANY(${ids}::uuid[])
        ORDER BY id LIMIT ${batchSize} FOR UPDATE
      )
      UPDATE images SET deleted_at = CURRENT_TIMESTAMP,
        deletion_posts_completed_at = CURRENT_TIMESTAMP,
        upload_error = ${ABANDONED_UPLOAD_ERROR}
      FROM candidates WHERE images.id = candidates.id`)
  }
  await transaction.commit()
  return page
}

async function deleteAbandonedStorage(image: UploadCleanupRow): Promise<string | undefined> {
  try {
    await deleteKnownImageStorageFromS3(image)
    return image.id
  } catch (err) {
    onError(err as Error)
    return undefined
  }
}

function rejectFailedPageEffects(results: readonly PromiseSettledResult<unknown>[]): void {
  const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length) throw new AggregateError(errors, 'Upload cleanup page effects failed')
}
