import assert from 'http-assert'
import pMap from 'p-map'
import { background } from '@queues/background/queues'
import { backgroundCpu } from '@queues/background-cpu/queues'
import {
  BACKGROUND_CPU_DOMAINS,
  BACKGROUND_CPU_QUEUE_NAME,
  getDomainStatsScanCap as getCpuDomainStatsScanCap,
  isBackgroundCpuDomain,
  type BackgroundCpuDomain,
} from '@queues/background-cpu/config'
import { getBackgroundCpuJobNames } from '@queues/background-cpu/enqueues/registry'
import type { Queue } from 'glide-mq'
import {
  BACKGROUND_DOMAINS,
  BACKGROUND_QUEUE_NAME,
  getDomainStatsScanCap,
  isBackgroundDomain,
  type BackgroundDomain,
} from '@queues/background/config'
import { getBackgroundJobNames } from '@queues/background/enqueues/registry'
import { recordStaffOperation } from '@services/moderator-actions'
import {
  getQueueDomainControl,
  listQueueDomainControls,
  pauseQueueDomain,
  resumeQueueDomain,
  type QueueDomainControl,
} from '@services/queue-domain-controls'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanAccessQueueStats } from './authorization.mts'
import { countDomainJobs, readSharedStates, type DomainStateCounts } from './domain-stats.mts'

const RETRY_FAILED_LIMIT = 100
const DOMAIN_SCAN_CONCURRENCY = 4
const MAX_REASON_LENGTH = 500

export type ManagedQueueDomain = DomainStateCounts & {
  domain: string
  paused: boolean
  paused_at: string | null
  paused_by: string | null
  reason: string | null
}

/** True for a queue whose work is split into operator-controlled domains. */
export function queueHasDomains(queueName: string): boolean {
  return queueName === BACKGROUND_QUEUE_NAME || queueName === BACKGROUND_CPU_QUEUE_NAME
}

/**
 * Every domain of a shared queue with its pause state and capped per-state counts. The queue-wide
 * totals on `GET /mq/queues` stay exact; these counts are read fresh and may stop at the cap.
 */
export async function listManagedQueueDomains(queueName: string) {
  const selection = requireDomainQueue(queueName)
  const cap = selection.scanCap
  const shared = await readSharedStates(selection.queue, cap)
  const controls = new Map(
    (await listQueueDomainControls(selection.domains)).map(control => [control.domain, control]),
  )
  const domains = await pMap(
    selection.domains,
    async (domain): Promise<ManagedQueueDomain> => ({
      ...toManagedControl(controls.get(domain)!),
      ...(await countDomainJobs(selection.queue, selection.getJobNames(domain), cap, shared)),
    }),
    { concurrency: DOMAIN_SCAN_CONCURRENCY },
  )
  return { domains }
}

export async function setManagedQueueDomainPaused(
  currentUser: PrivateUser,
  queueName: string,
  domainName: string,
  input: { paused: boolean; reason?: string | null },
) {
  assertOperator(currentUser)
  requireDomainQueue(queueName)
  const domain = requireDomain(queueName, domainName)
  const reason = normalizeReason(input.reason)
  if ((await getQueueDomainControl(domain)).paused === input.paused) {
    return { success: true as const }
  }
  await recordStaffOperation(
    currentUser.id,
    {
      actionType: input.paused ? 'queue_pause' : 'queue_resume',
      queueName,
      reason,
      metadata: { domain },
    },
    () =>
      input.paused
        ? pauseQueueDomain(domain, { userId: currentUser.id, reason })
        : resumeQueueDomain(domain),
  )
  return { success: true as const }
}

export async function retryManagedQueueDomainFailedJobs(
  currentUser: PrivateUser,
  queueName: string,
  domainName: string,
) {
  assertOperator(currentUser)
  const selection = requireDomainQueue(queueName)
  const domain = requireDomain(queueName, domainName)
  const result = await recordStaffOperation(
    currentUser.id,
    { actionType: 'queue_retry_failed', queueName, metadata: { domain } },
    async () => {
      const failedJobs = await collectFailedJobs(selection.queue, selection.getJobNames(domain))
      const results = await Promise.allSettled(failedJobs.map(job => job.retry()))
      return {
        attempted: results.length,
        retried: results.filter(outcome => outcome.status === 'fulfilled').length,
      }
    },
    outcome => ({ after: outcome }),
  )
  return { success: true as const, retried: result.retried }
}

async function collectFailedJobs(queue: Queue, names: readonly string[]) {
  const failed: Awaited<ReturnType<Queue['searchJobs']>> = []
  for (const name of names) {
    // oxlint-disable-next-line no-await-in-loop -- each search spends part of one retry budget
    const jobs = await queue.searchJobs({
      state: 'failed',
      name,
      limit: RETRY_FAILED_LIMIT - failed.length,
      excludeData: true,
    })
    failed.push(...jobs)
    if (failed.length >= RETRY_FAILED_LIMIT) break
  }
  return failed
}

function toManagedControl(control: QueueDomainControl) {
  return {
    domain: control.domain,
    paused: control.paused,
    paused_at: control.pausedAt,
    paused_by: control.pausedBy,
    reason: control.reason,
  }
}

function normalizeReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim()
  if (!trimmed) return null
  assert(
    trimmed.length <= MAX_REASON_LENGTH,
    422,
    `Reason must be at most ${MAX_REASON_LENGTH} characters`,
  )
  return trimmed
}

type DomainQueueSelection = {
  queue: Queue
  domains: readonly string[]
  scanCap: number
  getJobNames: (domain: string) => string[]
}

function requireDomainQueue(queueName: string): DomainQueueSelection {
  assert(queueHasDomains(queueName), 404, 'Queue has no domains')
  if (queueName === BACKGROUND_CPU_QUEUE_NAME)
    return {
      queue: backgroundCpu,
      domains: BACKGROUND_CPU_DOMAINS,
      scanCap: getCpuDomainStatsScanCap(),
      getJobNames: domain => getBackgroundCpuJobNames(domain as BackgroundCpuDomain),
    }
  return {
    queue: background,
    domains: BACKGROUND_DOMAINS,
    scanCap: getDomainStatsScanCap(),
    getJobNames: domain => getBackgroundJobNames(domain as BackgroundDomain),
  }
}

function requireDomain(queueName: string, domain: string): string {
  const known =
    queueName === BACKGROUND_CPU_QUEUE_NAME
      ? isBackgroundCpuDomain(domain)
      : isBackgroundDomain(domain)
  assert(known, 404, 'Domain not found')
  return domain
}

function assertOperator(currentUser: PrivateUser): void {
  assert(currentUserCanAccessQueueStats(currentUser), 403, 'Forbidden')
  assertNotSuspended(currentUser)
}
