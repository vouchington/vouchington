import { getBackgroundJobNames } from '@queues/background/enqueues/registry'
import type { BackgroundDomain } from '@queues/background/config'
import type { Queue } from 'glide-mq'

export const DOMAIN_STATS_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const
export type DomainStatsState = (typeof DOMAIN_STATS_STATES)[number]

/**
 * A job count from a capped scan. `complete: false` means the scan stopped at the cap, so
 * `count` is a lower bound and a client shows it as `count+`.
 */
export type DomainStateCount = { count: number; complete: boolean }
export type DomainStateCounts = Record<DomainStatsState, DomainStateCount>

type StatsQueue = Pick<Queue, 'searchJobs' | 'getJobs'>

/** Job names in the queue-wide read of a state, and whether that read reached its end. */
export type SharedStateRead = { names: readonly string[]; complete: boolean }
export type SharedStateReads = Record<'waiting' | 'active' | 'delayed', SharedStateRead>

const SHARED_STATES = ['waiting', 'active', 'delayed'] as const

/**
 * Reads the first `cap` jobs of the waiting, active and delayed states once, for every domain of
 * a request. GlideMQ's name search cannot bound these: it lists every waiting id before it
 * filters, and it never sees an active priority job. A read that fills the cap is partial for
 * every domain, because jobs of any domain may lie beyond it.
 */
export async function readSharedStates(queue: StatsQueue, cap: number): Promise<SharedStateReads> {
  const [waiting, active, delayed] = await Promise.all(
    SHARED_STATES.map(async state => {
      const jobs = await queue.getJobs(state, 0, cap - 1, { excludeData: true })
      return { names: jobs.map(job => job.name), complete: jobs.length < cap }
    }),
  )
  return { waiting: waiting!, active: active!, delayed: delayed! }
}

/**
 * Counts a domain's jobs in each state from a scan capped at `cap` jobs. Waiting, active and
 * delayed counts bucket the shared reads by the domain's own job names, so another domain's jobs
 * are never counted. `completed` and `failed` search the domain's names, which retention bounds,
 * so they usually reach the end of the scan and come out exact. Nothing is counted ahead of time
 * or cached.
 */
export async function countDomainJobs(
  queue: StatsQueue,
  domain: BackgroundDomain,
  cap: number,
  shared?: SharedStateReads,
): Promise<DomainStateCounts> {
  const names = getBackgroundJobNames(domain)
  const reads = shared ?? (await readSharedStates(queue, cap))
  const entries = await Promise.all(
    DOMAIN_STATS_STATES.map(
      async state =>
        [
          state,
          state === 'completed' || state === 'failed'
            ? await countByNameSearch(queue, state, names, cap)
            : countShared(reads[state], names, cap),
        ] as const,
    ),
  )
  return Object.fromEntries(entries) as DomainStateCounts
}

function countShared(
  read: SharedStateRead,
  names: readonly string[],
  cap: number,
): DomainStateCount {
  const matches = read.names.filter(name => names.includes(name)).length
  return { count: Math.min(matches, cap), complete: read.complete && matches < cap }
}

async function countByNameSearch(
  queue: StatsQueue,
  state: 'completed' | 'failed',
  names: readonly string[],
  cap: number,
): Promise<DomainStateCount> {
  let count = 0
  for (const name of names) {
    // Names run one after another so the remaining budget shrinks and the whole domain stays under the cap.
    // oxlint-disable-next-line no-await-in-loop -- each search spends part of the same scan budget
    const jobs = await queue.searchJobs({ state, name, limit: cap - count, excludeData: true })
    count += jobs.length
    if (count >= cap) break
  }
  return { count: Math.min(count, cap), complete: count < cap }
}
