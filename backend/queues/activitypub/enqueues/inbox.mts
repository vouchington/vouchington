import { randomUUID } from 'node:crypto'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  ACTIVITYPUB_INBOX_JOB_POLICY,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import type { ActivityPubInboxDeliveryJob } from '../types.mts'

const enqueueDeliveryJob = createBackgroundEnqueue(ACTIVITYPUB_PROCESS_DELIVERY_JOB)

export function enqueueActivityPubInboxDelivery(
  data: ActivityPubInboxDeliveryJob,
  jobId: string,
): EnqueueReturnType {
  return enqueueDeliveryJob(data, {
    jobId,
    deduplication: { id: `activitypub-inbox__${data.requestDigest}`, mode: 'simple' },
  } satisfies Partial<JobOptions>)
}

export function createActivityPubInboxDeliveryJobId(requestDigest: string): string {
  return `activitypub-inbox__${requestDigest}__${randomUUID()}`
}

/** The reservation self-heal interval follows retries, sender delay, and actor-fetch deadlines. */
export function getActivityPubInboxDeliveryTtlMs(
  maxSenderDelayMs: number,
  dnsTimeoutMs: number,
  fetchTimeoutMs: number,
): number {
  const { attempts, backoff } = ACTIVITYPUB_INBOX_JOB_POLICY
  const actorFetchDeadlineMs = dnsTimeoutMs + fetchTimeoutMs * 2
  let retryBackoffMs = 0
  for (let attempt = 1; attempt < attempts; attempt += 1)
    retryBackoffMs += backoff.delay * 2 ** (attempt - 1) * (1 + backoff.jitter)
  return Math.ceil(
    retryBackoffMs + maxSenderDelayMs + attempts * actorFetchDeadlineMs + actorFetchDeadlineMs,
  )
}
