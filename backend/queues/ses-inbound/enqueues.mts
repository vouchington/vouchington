import { createHash } from 'node:crypto'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
import {
  assertSesInboundReconcileJobData,
  getSesInboundProcessJobOptions,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { SES_INBOUND_RECONCILE_INTERVAL_MS } from './config.mts'
import { sesInboundQueue } from './queues.mts'

/** Retained failed process jobs read per reconciliation run; the queue's failure retention bounds them. */
const RETAINED_FAILED_JOB_LIMIT = 1_000

export const enqueueBulkSesInboundProcess = createBackgroundBulkEnqueue(
  SES_INBOUND_PROCESS_JOB,
  (data: SesInboundProcessJobData) => ({ data, opts: getSesInboundProcessJobOptions(data) }),
)

export type RetryableSesInboundJob = {
  id: string
  name: string
  retry(): Promise<void>
}

type SesInboundRecoveryDependencies = {
  enqueueBulk: typeof enqueueBulkSesInboundProcess
  getFailedJobs(): Promise<RetryableSesInboundJob[]>
}

const recoveryDependencies: SesInboundRecoveryDependencies = {
  enqueueBulk: enqueueBulkSesInboundProcess,
  getFailedJobs: () =>
    sesInboundQueue.searchJobs({
      state: 'failed',
      name: SES_INBOUND_PROCESS_JOB.name,
      limit: RETAINED_FAILED_JOB_LIMIT,
      excludeData: true,
    }),
}

export function readRetainedFailedSesInboundProcessJobs(): Promise<RetryableSesInboundJob[]> {
  return recoveryDependencies.getFailedJobs()
}

export async function enqueueOrRetryBulkSesInboundProcess(
  inputs: SesInboundProcessJobData[],
  failedJobs?: RetryableSesInboundJob[],
  dependencies: SesInboundRecoveryDependencies = recoveryDependencies,
): Promise<number> {
  await dependencies.enqueueBulk(inputs)
  return retryFailedSesInboundProcessJobs(
    inputs,
    failedJobs ?? (await dependencies.getFailedJobs()),
  )
}

async function retryFailedSesInboundProcessJobs(
  inputs: SesInboundProcessJobData[],
  failedJobs: RetryableSesInboundJob[],
): Promise<number> {
  const processJobIds = new Set(inputs.map(input => getSesInboundProcessJobOptions(input).jobId))
  const retryableJobs = failedJobs.filter(
    job => job.name === SES_INBOUND_PROCESS_JOB.name && processJobIds.has(job.id),
  )
  await Promise.all(retryableJobs.map(job => job.retry()))
  return retryableJobs.length
}

const enqueueReconcileJob = createBackgroundEnqueue(SES_INBOUND_RECONCILE_JOB)

export function enqueueSesInboundReconcileContinuation(
  continuationToken: string,
): EnqueueReturnType {
  const data = { continuationToken }
  assertSesInboundReconcileJobData(data)
  const digest = createHash('sha256').update(continuationToken).digest('hex')
  return enqueueReconcileJob(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    jobId: `ses_inbound_reconcile_continuation__${digest}`,
    // Release a terminal token claim so a later scheduled sweep can resume after exhausted retries.
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies Partial<JobOptions>)
}

export function enqueueSesInboundReconcile(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / SES_INBOUND_RECONCILE_INTERVAL_MS)
  return enqueueReconcileJob({}, {
    jobId: `ses_inbound_reconcile__${bucket}`,
    deduplication: {
      id: 'ses_inbound_reconcile',
      mode: 'throttle',
      ttl: SES_INBOUND_RECONCILE_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}
