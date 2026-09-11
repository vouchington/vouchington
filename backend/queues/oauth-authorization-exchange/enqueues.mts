import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCHER_PRIORITY,
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS,
  OAUTH_AUTHORIZATION_EXCHANGE_ORDERING,
  OAUTH_AUTHORIZATION_EXCHANGE_PRIORITY,
  OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
} from './config.mts'
import { oauthAuthorizationExchangeQueue } from './queues.mts'
import type { OAuthAuthorizationExchangeJobData, OAuthAuthorizationExchangeJobs } from './types.mts'

const exchangeJobDefaults = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 250 },
  removeOnComplete: 100,
  removeOnFail: 100,
}

const enqueueExchangeJob = createEnqueueFunction<
  OAuthAuthorizationExchangeJobData,
  OAuthAuthorizationExchangeJobs
>({
  queue: oauthAuthorizationExchangeQueue,
  queueName: OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
  jobName: 'exchangeOAuthAuthorization',
  defaults: exchangeJobDefaults,
})

const enqueueDispatcherJob = createEnqueueFunction<
  Record<string, never>,
  OAuthAuthorizationExchangeJobs
>({
  queue: oauthAuthorizationExchangeQueue,
  queueName: OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
  jobName: 'dispatchOAuthAuthorizationExchanges',
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export const enqueueBulkOAuthAuthorizationExchanges = createBulkEnqueueFunction<
  OAuthAuthorizationExchangeJobData,
  OAuthAuthorizationExchangeJobData,
  OAuthAuthorizationExchangeJobs
>({
  queue: oauthAuthorizationExchangeQueue,
  queueName: OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
  jobName: 'exchangeOAuthAuthorization',
  defaults: exchangeJobDefaults,
  buildJob: data => ({
    data,
    opts: getOAuthAuthorizationExchangeJobOptions(data.authorizationId),
  }),
})

type RetryableOAuthAuthorizationExchangeJob = {
  id: string
  name: string
  retry(): Promise<void>
}

type RecoverableOAuthAuthorizationExchangeJob = {
  id: string
  name: string
  remove(): Promise<void>
}

type OAuthAuthorizationExchangeRecoveryDependencies = {
  enqueueBulk: typeof enqueueBulkOAuthAuthorizationExchanges
  getCompletedJobs(): Promise<RecoverableOAuthAuthorizationExchangeJob[]>
  getFailedJobs(): Promise<RetryableOAuthAuthorizationExchangeJob[]>
}

const recoveryDependencies: OAuthAuthorizationExchangeRecoveryDependencies = {
  enqueueBulk: enqueueBulkOAuthAuthorizationExchanges,
  getCompletedJobs: () =>
    oauthAuthorizationExchangeQueue.getJobs('completed', 0, -1, { excludeData: true }),
  getFailedJobs: () =>
    oauthAuthorizationExchangeQueue.getJobs('failed', 0, -1, { excludeData: true }),
}

export async function enqueueOrReactivateBulkOAuthAuthorizationExchanges(
  inputs: OAuthAuthorizationExchangeJobData[],
  dependencies: OAuthAuthorizationExchangeRecoveryDependencies = recoveryDependencies,
): Promise<number> {
  if (inputs.length === 0) return 0
  const authorizationIds = new Set(inputs.map(input => input.authorizationId))
  const [completedJobs, failedJobs] = await Promise.all([
    dependencies.getCompletedJobs(),
    dependencies.getFailedJobs(),
  ])
  const removableJobs = completedJobs.filter(
    job => job.name === 'exchangeOAuthAuthorization' && authorizationIds.has(job.id),
  )
  await Promise.all(removableJobs.map(job => job.remove()))
  await dependencies.enqueueBulk(inputs)
  const retryableJobs = failedJobs.filter(
    job => job.name === 'exchangeOAuthAuthorization' && authorizationIds.has(job.id),
  )
  await Promise.all(retryableJobs.map(job => job.retry()))
  return retryableJobs.length
}

export async function enqueueOAuthAuthorizationExchange(authorizationId: string): Promise<void> {
  await enqueueExchangeJob(
    { authorizationId },
    getOAuthAuthorizationExchangeJobOptions(authorizationId),
  )
}

export async function enqueueOAuthAuthorizationExchangeDispatcher(options?: {
  deduplicationId?: string
}): Promise<void> {
  const deduplicationId = options?.deduplicationId ?? 'oauth-authorization-exchange-dispatcher'
  await enqueueDispatcherJob({}, {
    jobId: deduplicationId,
    priority: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCHER_PRIORITY,
    ordering: OAUTH_AUTHORIZATION_EXCHANGE_ORDERING.dispatcher,
    deduplication: {
      id: deduplicationId,
      mode: 'throttle',
      ttl: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function getOAuthAuthorizationExchangeJobOptions(authorizationId: string): Partial<JobOptions> {
  return {
    jobId: authorizationId,
    priority: OAUTH_AUTHORIZATION_EXCHANGE_PRIORITY,
    deduplication: { id: authorizationId, mode: 'simple' },
  }
}
