import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { parseCleanupAbandonedUploadsData } from '@queues/content-analysis/payload/upload-cleanup'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import { initializeAbandonedUploadSweep } from '@services/images/cleanup-upload-sweep'
import { recoverImageDeletions } from '@services/images/recover-deletions'
import type { Job } from 'glide-mq'

/** The scheduler lease covers one active pass; row locks, idempotent deletes and extraction deduplication make overlapping sweeps replayable. */
export async function processUploadCleanupJob(job: Job) {
  const data = parseCleanupAbandonedUploadsData(job.data)
  if (!data.sweep) await recoverImageDeletions()
  const sweep = data.sweep ?? (await initializeAbandonedUploadSweep())
  if (!data.sweep) await job.updateData({ sweep })
  const pass = await cleanupAbandonedUploads(sweep, next => job.updateData({ sweep: next }))
  const result = await processRetainedSweep(job, async () => pass)
  return {
    cleaned: result.cleaned,
    recovered: result.recovered,
    stagedSourcesDeleted: result.stagedSourcesDeleted,
  }
}
