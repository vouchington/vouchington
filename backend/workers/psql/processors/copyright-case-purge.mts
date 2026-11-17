import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import type { CopyrightCasePurgeJobData } from '@queues/psql/types'
import { runScheduledCopyrightCasePurgePage } from '@services/copyright-notices/retention-case-purge-scheduled'
import type { Job } from 'glide-mq'

/** Native updateData and moveToDelayed preserve the active job id across bounded pages. */
export function processCopyrightCasePurge(
  job: Pick<Job<CopyrightCasePurgeJobData>, 'data' | 'updateData' | 'moveToDelayed'>,
) {
  let resumeAt = Date.now()
  return processRetainedSweep(
    job,
    async save => {
      const result = await runScheduledCopyrightCasePurgePage(job.data)
      if (result.deferred) resumeAt = Date.now() + 5 * 60_000
      if (result.hasMore) await save(result.data)
      return result
    },
    {
      get resumeAt() {
        return resumeAt
      },
    },
  )
}
