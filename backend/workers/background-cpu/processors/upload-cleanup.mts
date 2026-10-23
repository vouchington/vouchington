import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { parseCleanupAbandonedUploadsData } from '@queues/content-analysis/payload/upload-cleanup'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import {
  captureStagedUploadCleanupSweep,
  cleanupStagedUploadSweepPage,
} from '@services/images/cleanup-staged-upload-sweep'
import type { Job } from 'glide-mq'

/** Keep the current recovery and abandonment phases ahead of each retained staged page. */
export async function processUploadCleanupJob(job: Job) {
  return processRetainedSweep(job, async save => {
    const data = parseCleanupAbandonedUploadsData(job.data)
    const staged = data.staged ?? (await captureStagedUploadCleanupSweep())
    if (!data.staged) await save({ staged })
    const otherPhases = await cleanupAbandonedUploads()
    const page = await cleanupStagedUploadSweepPage(staged, next => save({ staged: next }))
    return {
      ...otherPhases,
      stagedSourcesDeleted: page.stagedSourcesDeleted,
      hasMore: page.hasMore,
    }
  })
}
