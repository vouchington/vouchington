import type { JobOptions } from 'glide-mq'
import { EMAIL_DIGESTS_JOBS } from '@queues/background/enqueues/email-digests-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { background } from '@queues/background/queues'
import { emails } from '../queues.mts'

const DOMAIN_PREFIX = 'email-digests.'
// One startup pass reads at most this many failed jobs per name, then stops. The next worker
// start continues. Waiting and delayed jobs are claimed by the emails worker, which rehomes
// each one; failed jobs are terminal and would otherwise keep a claimed send key.
const FAILED_PAGE_SIZE = 50
const MAX_FAILED_PAGES = 20

const legacyDigestJobs = new Map<string, BackgroundJobDefinition>(
  EMAIL_DIGESTS_JOBS.map(job => [job.name.slice(DOMAIN_PREFIX.length), job]),
)

type RehomeTarget = {
  add: (
    name: string,
    data: unknown,
    opts?: JobOptions,
  ) => Promise<{ id: string; name: string; data: unknown } | null>
}

type FailedLegacyJob = {
  id: string
  name: string
  data: unknown
  remove: () => Promise<unknown>
}

type FailedLegacySource = {
  searchJobs: (opts: { name: string; state: 'failed'; limit: number }) => Promise<FailedLegacyJob[]>
}

export function isLegacyEmailDigestJobName(name: string): boolean {
  return legacyDigestJobs.has(name)
}

/** Copy one digest job admitted on `emails` onto the email-digests domain. */
export function rehomeLegacyEmailDigestJob(
  source: { id: string; name: string; data: unknown },
  target: RehomeTarget = background,
): Promise<{ id: string; name: string; data: unknown } | null> {
  const job = legacyDigestJobs.get(source.name)
  if (!job) throw new Error(`not a legacy email digest job: ${source.name}`)
  return target.add(job.name, source.data, {
    ...job.options,
    // The source id makes a second worker's copy of the same job a no-op.
    deduplication: { id: `emails:legacy-digest:${source.id}`, mode: 'simple' },
  })
}

/**
 * Move digest jobs that already failed on `emails` onto email-digests.
 * A full last page throws so a larger backlog is visible and the next start continues.
 */
export async function drainFailedLegacyEmailDigestJobs(
  source: FailedLegacySource = emails,
  target: RehomeTarget = background,
): Promise<void> {
  for (const name of legacyDigestJobs.keys()) {
    for (let page = 0; page < MAX_FAILED_PAGES; page += 1) {
      // The next page is this same search after these jobs are removed. There is no cursor.
      // oxlint-disable-next-line no-await-in-loop -- removing this page is what makes the next search advance
      const failed = await source.searchJobs({ name, state: 'failed', limit: FAILED_PAGE_SIZE })
      if (failed.length === 0) break
      // oxlint-disable-next-line no-await-in-loop -- this page must leave the failed set before the next search
      await Promise.all(
        failed.map(async job => {
          await rehomeLegacyEmailDigestJob({ id: job.id, name: job.name, data: job.data }, target)
          await job.remove()
        }),
      )
      if (failed.length < FAILED_PAGE_SIZE) break
      if (page === MAX_FAILED_PAGES - 1) {
        throw new Error(`legacy email digest drain left more failed ${name} jobs`)
      }
    }
  }
}
