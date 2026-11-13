import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import type { CopyrightAccountClockSyncJobData } from '@queues/psql/types'
import { runCopyrightAccountClockSyncPage } from '@services/copyright-notices/retention-account-clock-sync'
import type { Job } from 'glide-mq'

export function processCopyrightAccountClockSync(
  job: Pick<Job<CopyrightAccountClockSyncJobData>, 'data' | 'updateData' | 'moveToDelayed'>,
  options: { pageSize?: number } = {},
) {
  return processRetainedSweep(job, async save => {
    const result = await runCopyrightAccountClockSyncPage(job.data, options.pageSize)
    if (result.hasMore) await save(result.data)
    return result
  })
}
