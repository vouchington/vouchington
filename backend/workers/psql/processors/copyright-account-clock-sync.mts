import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import type { CopyrightAccountClockSyncJobData } from '@queues/psql/types'
import { runCopyrightAccountClockSyncPage } from '../../../services/copyright-notices/retention-account-clock-sync.mts'
import type { Job } from 'glide-mq'

export function processCopyrightAccountClockSync(
  job: Pick<Job<CopyrightAccountClockSyncJobData>, 'data' | 'updateData' | 'moveToDelayed'>,
) {
  return processRetainedSweep(job, async save => {
    const result = await runCopyrightAccountClockSyncPage(job.data)
    if (result.hasMore) await save(result.data)
    return result
  })
}
