import assert from 'http-assert'
import pMap from 'p-map'
import { background } from '@queues/background/queues'
import {
  BACKGROUND_DOMAINS,
  BACKGROUND_QUEUE_NAME,
  getDomainStatsScanCap,
  isBackgroundDomain,
} from '@queues/background/config'
import { getBackgroundJobNames } from '@queues/background/enqueues/registry'
import { recordStaffOperation } from '@services/moderator-actions'
import {
  getQueueDomainControl,
  listQueueDomainControls,
  pauseQueueDomain,
  resumeQueueDomain,
  runningQueueDomainControl,
  type QueueDomainControl,
} from '@services/queue-domain-controls'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanAccessQueueStats } from './authorization.mts'
import { countDomainJobs, readSharedStates, type DomainStateCounts } from './domain-stats.mts'

/** Failed jobs one retry request replays, the same bound as a whole-queue retry. */
const RETRY_FAILED_LIMIT = 100
/** Domains scanned at once; each scan already runs its five states in parallel. */
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
  return queueName === BACKGROUND_QUEUE_NAME
}

/**
 * Every domain of a shared queue with its pause state and capped per-state counts. The queue-wide
 * totals on `GET /mq/queues` stay exact; these counts are read fresh and may stop at the cap.
 */
export async function listManagedQueueDomains(queueName: string) {
  requireDomainQueue(queueName)
  const cap = getDomainStatsScanCap()
  const shared = await readSharedStates(background, cap)
  const controls = new Map(
    (await listQueueDomainControls()).map(control => [control.domain, control]),
  )
  const domains = await pMap(
    BACKGROUND_DOMAINS,
    async (domain): Promise<ManagedQueueDomain> => ({
      ...toManagedControl(controls.get(domain) ?? runningQueueDomainControl(domain)),
      ...(await countDomainJobs(background, domain, cap, shared)),
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
  const domain = requireDomain(domainName)
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
  requireDomainQueue(queueName)
  const domain = requireDomain(domainName)
  const result = await recordStaffOperation(
    currentUser.id,
    { actionType: 'queue_retry_failed', queueName, metadata: { domain } },
    async () => {
      const failedJobs = await collectFailedJobs(getBackgroundJobNames(domain))
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

async function collectFailedJobs(names: readonly string[]) {
  const failed: Awaited<ReturnType<typeof background.searchJobs>> = []
  for (const name of names) {
    // oxlint-disable-next-line no-await-in-loop -- each search spends part of one retry budget
    const jobs = await background.searchJobs({
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

function requireDomainQueue(queueName: string): void {
  assert(queueHasDomains(queueName), 404, 'Queue has no domains')
}

function requireDomain(domain: string) {
  assert(isBackgroundDomain(domain), 404, 'Domain not found')
  return domain
}

function assertOperator(currentUser: PrivateUser): void {
  assert(currentUserCanAccessQueueStats(currentUser), 403, 'Forbidden')
  assertNotSuspended(currentUser)
}
