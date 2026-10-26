import type { Job } from 'glide-mq'
import type { ModerationRetentionJobData } from '@queues/psql/types'
import { enqueueModerationRetentionContinuation } from '@queues/psql/enqueues/moderation-retention'
import { cleanupModerationRecords } from '@services/data-retention/cleanup-moderation-records'
import {
  dataRetentionConfig,
  getModerationRecordCleanupLimits,
} from '@services/data-retention/config'

/** Each receipt belongs to one bounded page budget; only unfinished families continue. */
export async function processModerationRetentionCleanup(
  job: Pick<Job<ModerationRetentionJobData>, 'id' | 'data' | 'updateData'>,
) {
  await dataRetentionConfig.waitForInitialization()
  let result = job.data.receipt
  if (!result) {
    result = await cleanupModerationRecords({
      ...getModerationRecordCleanupLimits(),
      kinds: job.data.remainingKinds,
    })
    await job.updateData({ ...job.data, receipt: result })
  }
  if (result.hasMore) {
    await enqueueModerationRetentionContinuation({
      rootJobId: job.data.rootJobId ?? job.id,
      hop: (job.data.hop ?? 0) + 1,
      remainingKinds: result.remainingKinds,
    })
  }
  return result
}
