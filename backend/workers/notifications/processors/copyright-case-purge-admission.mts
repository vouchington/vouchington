import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import type { CopyrightCasePurgeAdmissionData } from '../../../queues/background/enqueues/notifications-domain.mts'
import { admitCopyrightCasePurgePage } from '@services/copyright-notices/retention-case-purge-admission'
import type { Job } from 'glide-mq'

/** The scheduled admission carries its index cursor in the same native job across pages. */
export async function processCopyrightCasePurgeAdmission(
  job: Pick<Job<CopyrightCasePurgeAdmissionData>, 'data' | 'updateData' | 'moveToDelayed'>,
) {
  const page = await admitCopyrightCasePurgePage(job.data)
  return processRetainedSweep(
    job,
    async save => {
      if (page.hasMore) await save(page.next)
      return page
    },
    { resumeAt: page.stalled ? Date.now() + 5 * 60_000 : Date.now() },
  )
}
