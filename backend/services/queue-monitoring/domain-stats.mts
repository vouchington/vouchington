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

type SearchQueue = Pick<Queue, 'searchJobs' | 'getJobs'>

/**
 * The names of the queue's active jobs. GlideMQ's name search never sees an active priority job,
 * which has no stream entry, so active counts bucket this list instead. Active jobs are bounded by
 * the workers' combined concurrency, so one read serves every domain of a request.
 */
export async function readActiveJobNames(queue: Pick<Queue, 'getJobs'>): Promise<string[]> {
  const jobs = await queue.getJobs('active', 0, -1, { excludeData: true })
  return jobs.map(job => job.name)
}

/**
 * Counts a domain's jobs in each state from a scan capped at `cap` jobs per domain and state.
 * Only the domain's own job names are searched, so another domain's jobs are never counted. Reads
 * the queue on every call and keeps no counters. `failed` and `completed` are bounded by
 * retention, so they usually reach the end of the scan and come out exact.
 */
export async function countDomainJobs(
  queue: SearchQueue,
  domain: BackgroundDomain,
  cap: number,
  activeJobNames?: readonly string[],
): Promise<DomainStateCounts> {
  const names = getBackgroundJobNames(domain)
  const active = activeJobNames ?? (await readActiveJobNames(queue))
  const entries = await Promise.all(
    DOMAIN_STATS_STATES.map(
      async state =>
        [
          state,
          state === 'active'
            ? capCount(active.filter(name => names.includes(name)).length, cap)
            : await countState(queue, state, names, cap),
        ] as const,
    ),
  )
  return Object.fromEntries(entries) as DomainStateCounts
}

function capCount(matches: number, cap: number): DomainStateCount {
  return matches >= cap ? { count: cap, complete: false } : { count: matches, complete: true }
}

async function countState(
  queue: SearchQueue,
  state: DomainStatsState,
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
  return capCount(count, cap)
}
