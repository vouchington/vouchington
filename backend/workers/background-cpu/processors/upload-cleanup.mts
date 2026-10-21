import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { parseCleanupAbandonedUploadsData } from '@queues/content-analysis/payload/upload-cleanup'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import {
  getUploadCleanupResumeAt,
  initializeAbandonedUploadSweep,
} from '@services/images/cleanup-upload-sweep'
import type { Job } from 'glide-mq'

export async function processUploadCleanupJob(job: Job) {
  const data = parseCleanupAbandonedUploadsData(job.data)
  const sweep = data.sweep ?? (await initializeAbandonedUploadSweep())
  if (!data.sweep) await job.updateData({ sweep })
  const pass = await cleanupAbandonedUploads(sweep, next => job.updateData({ sweep: next }))
  const result = await processRetainedSweep(job, async () => pass, {
    resumeAt: getUploadCleanupResumeAt(pass.recoveryBackpressured),
  })
  return {
    cleaned: result.cleaned,
    recovered: result.recovered,
    stagedSourcesDeleted: result.stagedSourcesDeleted,
  }
}
