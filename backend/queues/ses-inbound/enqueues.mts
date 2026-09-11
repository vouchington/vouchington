import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import {
  SES_INBOUND_PROCESS_JOB_NAME,
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
  getSesInboundProcessJobOptions,
  type SesInboundProcessJobData,
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

type RetryableSesInboundJob = {
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

export async function enqueueOrRetryBulkSesInboundProcess(
  inputs: SesInboundProcessJobData[],
  dependencies: SesInboundRecoveryDependencies = recoveryDependencies,
): Promise<number> {
  await dependencies.enqueueBulk(inputs)
  return retryFailedSesInboundProcessJobs(inputs, dependencies)
}

async function retryFailedSesInboundProcessJobs(
  inputs: SesInboundProcessJobData[],
  dependencies: SesInboundRecoveryDependencies,
): Promise<number> {
  const processJobIds = new Set(inputs.map(input => getSesInboundProcessJobOptions(input).jobId))
  const failedJobs = await dependencies.getFailedJobs()
  const retryableJobs = failedJobs.filter(
    job => job.name === SES_INBOUND_PROCESS_JOB_NAME && processJobIds.has(job.id),
  )
  await Promise.all(retryableJobs.map(job => job.retry()))
  return retryableJobs.length
}

const enqueueReconcileJob = createEnqueueFunction<
  Record<string, never>,
  typeof SES_INBOUND_RECONCILE_JOB_NAME
>({
  queue: sesInboundQueue,
  queueName: SES_INBOUND_QUEUE_NAME,
  jobName: SES_INBOUND_RECONCILE_JOB_NAME,
})

export function enqueueSesInboundProcess(data: SesInboundProcessJobData): EnqueueReturnType {
  return enqueueProcessJob(data, getSesInboundProcessJobOptions(data))
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
