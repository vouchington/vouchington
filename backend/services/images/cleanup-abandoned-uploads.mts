import { getImagesWorkLimit } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
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
  recoveryQueue: typeof imageUploadsQueue = imageUploadsQueue,
) {
  const batchSize = getImagesWorkLimit('cleanup_batch_size')
  const enqueueRecovery = createExtractImageMetadataEnqueue(recoveryQueue)
  let recoveryBackpressured = false
  let state = sweep
  const counts = { cleaned: 0, recovered: 0, stagedSourcesDeleted: 0 }
  for (const phase of UPLOAD_CLEANUP_PHASES) {
    if (state.windows[phase].done) continue
    let pageSize = batchSize
    let available = batchSize
    if (phase === 'recovery') {
      // oxlint-disable-next-line no-await-in-loop -- every fan-out page checks the actual destination
      available = await readRecoveryCapacity(recoveryQueue)
      if (available === 0) {
        recoveryBackpressured = true
        continue
      }
      pageSize = Math.min(batchSize, available)
    }
    // oxlint-disable-next-line no-await-in-loop -- phase order preserves source cleanup before recovery and abandonment
    const page = await readPhase(state, phase, pageSize) // no-mistakes-disable-line query-reached-per-item: three fixed phases use bounded transactions and ordered checkpoints
    const rows = page.slice(0, pageSize)
    if (phase === 'staged') {
      for (let offset = 0; offset < rows.length; offset += STAGED_SOURCE_CLEANUP_CONCURRENCY) {
        // oxlint-disable-next-line no-await-in-loop -- cap dedicated advisory-lock sessions per process
        const results = await Promise.all(
          rows
            .slice(offset, offset + STAGED_SOURCE_CLEANUP_CONCURRENCY)
            .map(image => cleanupStagedUploadSource(image.id)),
        )
        counts.stagedSourcesDeleted += results.filter(Boolean).length
      }
    } else if (phase === 'recovery') {
      // A rejection prevents checkpointing. A deduplicated admission already has live extraction work.
      // oxlint-disable-next-line no-await-in-loop -- checkpoint only after the bounded fan-out settles
      await Promise.all(rows.map(image => enqueueRecovery(image.id)))
      if (page.length > pageSize && rows.length >= available) recoveryBackpressured = true
      counts.recovered += rows.length
    } else {
      // oxlint-disable-next-line no-await-in-loop -- retain best-effort per-image storage deletion after the committed soft delete
      const deletedIds = (await Promise.all(rows.map(deleteAbandonedStorage))).filter(
        (id): id is string => id !== undefined,
      )
      try {
        // oxlint-disable-next-line no-await-in-loop -- acknowledge the successful bounded phase as one SQL batch before checkpointing
        await markImageUploadSourcesDeleted(deletedIds) // no-mistakes-disable-line query-reached-per-item: one bounded acknowledgement batch per fixed phase preserves checkpoint ordering
      } catch (err) {
        onError(err as Error)
      }
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
          done: page.length <= pageSize,
        },
      },
    }
    // oxlint-disable-next-line no-await-in-loop -- durable progress follows effects, never the lookahead witness
    await save(state)
  }
  return {
    ...counts,
    recoveryBackpressured,
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

/** A capacity sample bounds this page, not concurrent producers' aggregate admissions. */
async function readRecoveryCapacity(queue: typeof imageUploadsQueue): Promise<number> {
  const counts = await queue.getJobCounts()
  const values = [counts.waiting, counts.active, counts.delayed]
  if (values.some(value => !Number.isSafeInteger(value) || value < 0))
    throw new Error('Invalid image extraction queue depth')
  const depth = values.reduce((total, value) => total + value, 0)
  return Math.max(0, getImagesWorkLimit('recovery_max_depth') - depth)
}
