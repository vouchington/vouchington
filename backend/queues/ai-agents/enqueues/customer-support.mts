import type { JobOptions } from 'glide-mq'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { CustomerSupportJobData } from '../types.mts'

const ONE_MINUTE_MS = 60_000

export type CustomerSupportEnqueueOptions =
  | {
      priority?: number
      logicalJobId?: never
      supportMessageId?: never
    }
  | {
      priority?: number
      logicalJobId: string
      supportMessageId: string
    }

export type KeyedCustomerSupportJobInput = {
  threadId: string
  supportMessageId: string
  logicalJobId: string
}

function buildKeyedCustomerSupportJob(input: KeyedCustomerSupportJobInput) {
  return {
    data: {
      threadId: input.threadId,
      idempotencyKey: input.logicalJobId,
      supportMessageId: input.supportMessageId,
    } satisfies CustomerSupportJobData,
    opts: {
      jobId: input.logicalJobId,
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['customer-support'],
      deduplication: { id: input.logicalJobId, mode: 'simple' as const },
    } satisfies JobOptions,
  }
}

const enqueueBulkCustomerSupport = createBulkEnqueueFunction<
  KeyedCustomerSupportJobInput,
  CustomerSupportJobData,
  'customer-support'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'customer-support',
  buildJob: buildKeyedCustomerSupportJob,
})

type RetryableCustomerSupportJob = {
  id: string
  name: string
  retry(): Promise<void>
}

type RecoverableCustomerSupportJob = {
  id: string
  name: string
  getState(): Promise<string>
  remove(): Promise<void>
}

type CustomerSupportRecoveryDependencies = {
  enqueueBulk: typeof enqueueBulkCustomerSupport
  getJob(id: string): Promise<RecoverableCustomerSupportJob | null>
  getFailedJobs(): Promise<RetryableCustomerSupportJob[]>
}

const recoveryDependencies: CustomerSupportRecoveryDependencies = {
  enqueueBulk: enqueueBulkCustomerSupport,
  getJob: id => ai_agents.getJob(id, { excludeData: true }),
  getFailedJobs: () => ai_agents.getJobs('failed', 0, -1, { excludeData: true }),
}

export async function enqueueOrRetryBulkCustomerSupport(
  inputs: KeyedCustomerSupportJobInput[],
  dependencies: CustomerSupportRecoveryDependencies = recoveryDependencies,
): Promise<number> {
  if (inputs.length === 0) return 0
  const retainedJobs = await Promise.all(
    inputs.map(input => dependencies.getJob(input.logicalJobId)),
  )
  await Promise.all(
    retainedJobs.map(async job => {
      if (job?.name === 'customer-support' && (await job.getState()) === 'completed') {
        await job.remove()
      }
    }),
  )
  await dependencies.enqueueBulk(inputs)
  const logicalJobIds = new Set(inputs.map(input => input.logicalJobId))
  const failedJobs = await dependencies.getFailedJobs()
  const retryableJobs = failedJobs.filter(
    job => job.name === 'customer-support' && logicalJobIds.has(job.id),
  )
  await Promise.all(retryableJobs.map(job => job.retry()))
  return retryableJobs.length
}

export function enqueueCustomerSupport(threadId: string, priority?: number): void {
  enqueueCustomerSupportAwaited(threadId, { priority }).catch(onError)
}

export function enqueueCustomerSupportAwaited(
  threadId: string,
  options: CustomerSupportEnqueueOptions = {},
): ReturnType<typeof ai_agents.add> {
  const logicalJobId = options.logicalJobId
  if (logicalJobId) {
    const job = buildKeyedCustomerSupportJob({
      threadId,
      logicalJobId,
      supportMessageId: options.supportMessageId,
    })
    const promise = ai_agents.add('customer-support', job.data, {
      ...job.opts,
      priority: options.priority ?? job.opts.priority,
    })
    trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'customer-support')
    return promise
  }
  const data: CustomerSupportJobData = { threadId }
  const job = ai_agents.add('customer-support', data, {
    attempts: AI_AGENTS_DEFAULTS.attempts,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: options.priority ?? AGENT_PRIORITY['customer-support'],
    deduplication: {
      id: `customer_support_${threadId}`,
      mode: 'debounce' as const,
      ttl: ONE_MINUTE_MS,
    },
  } satisfies JobOptions)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'customer-support')
  return job
}
