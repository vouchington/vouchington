import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { createHash } from 'node:crypto'
import {
  assertSesInboundReconcileJobData,
  SES_INBOUND_PROCESS_JOB_NAME,
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
  getSesInboundProcessJobOptions,
  type SesInboundProcessJobData,
  type SesInboundReconcileJobData,
} from '@ts-shared/ses-inbound-contract'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  SES_INBOUND_RECONCILE_INTERVAL_MS,
  SES_INBOUND_RECONCILE_ORDERING,
  SES_INBOUND_RECONCILE_PRIORITY,
} from './config.mts'
import { sesInboundQueue } from './queues.mts'

const enqueueProcessJob = createEnqueueFunction<
  SesInboundProcessJobData,
  typeof SES_INBOUND_PROCESS_JOB_NAME
>({
  queue: sesInboundQueue,
  queueName: SES_INBOUND_QUEUE_NAME,
  jobName: SES_INBOUND_PROCESS_JOB_NAME,
})

export const enqueueBulkSesInboundProcess = createBulkEnqueueFunction<
  SesInboundProcessJobData,
  SesInboundProcessJobData,
  typeof SES_INBOUND_PROCESS_JOB_NAME
>({
  queue: sesInboundQueue,
  queueName: SES_INBOUND_QUEUE_NAME,
  jobName: SES_INBOUND_PROCESS_JOB_NAME,
  buildJob: data => ({ data, opts: getSesInboundProcessJobOptions(data) }),
})

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
  getFailedJobs: () => sesInboundQueue.getJobs('failed', 0, -1, { excludeData: true }),
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
    job => job.name === SES_INBOUND_PROCESS_JOB_NAME && processJobIds.has(job.id),
  )
  await Promise.all(retryableJobs.map(job => job.retry()))
  return retryableJobs.length
}

const enqueueReconcileJob = createEnqueueFunction<
  SesInboundReconcileJobData,
  typeof SES_INBOUND_RECONCILE_JOB_NAME
>({
  queue: sesInboundQueue,
  queueName: SES_INBOUND_QUEUE_NAME,
  jobName: SES_INBOUND_RECONCILE_JOB_NAME,
})

export function enqueueSesInboundProcess(data: SesInboundProcessJobData): EnqueueReturnType {
  return enqueueProcessJob(data, getSesInboundProcessJobOptions(data))
}

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
    priority: SES_INBOUND_RECONCILE_PRIORITY,
    ordering: SES_INBOUND_RECONCILE_ORDERING,
    // Release a terminal token claim so a later scheduled sweep can resume after exhausted retries.
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies Partial<JobOptions>)
}

export function enqueueSesInboundReconcile(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / SES_INBOUND_RECONCILE_INTERVAL_MS)
  return enqueueReconcileJob({}, {
    jobId: `ses_inbound_reconcile__${bucket}`,
    priority: SES_INBOUND_RECONCILE_PRIORITY,
    ordering: SES_INBOUND_RECONCILE_ORDERING,
    deduplication: {
      id: 'ses_inbound_reconcile',
      mode: 'throttle',
      ttl: SES_INBOUND_RECONCILE_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}
