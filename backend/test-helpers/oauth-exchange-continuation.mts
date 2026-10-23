import { createTestOAuthOwnershipPersistence } from './oauth-exchange-ownership-fault.mts'
import {
  ownOAuthActors,
  type createOAuthActorCleanupReceipt,
} from './oauth-exchange-actor-owner.mts'
import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import { beginTransaction } from '@data-stores/psql'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../data-stores/valkey-core/glide-mq-client.mts'
import { backgroundHandler } from '../queues/background/enqueues/define-handler.mts'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
  type OAuthAuthorizationExchangeJobData,
} from '../queues/background/enqueues/oauth-authorization-exchange-jobs.mts'
import { createBackgroundProcessor } from '../workers/background/processors.mts'
import { processOAuthAuthorizationExchangeJob } from '../workers/oauth-authorization-exchange/processors/process-job.mts'
import { processOAuthAuthorizationExchange } from '../services/oauth/authorization-exchange.mts'
import {
  createTestOAuthContinuationDependencies,
  type OAuthContinuationMetrics,
  type OAuthContinuationFault,
} from './oauth-exchange-continuation-dependencies.mts'

/** Real queue attempts, real claim/decrypt/mutations, and an actual second PostgreSQL connection. */
export async function runTestOAuthExchangeContinuation(
  authorizationId: string,
  fault: OAuthContinuationFault,
  cleanupReceipt: ReturnType<typeof createOAuthActorCleanupReceipt>,
  recordedClaimId?: string,
  expireOnWriteFailure = false,
) {
  const name = `oauth_continuation_${randomUUID()}`
  const jobId = randomUUID()
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const errors: unknown[] = []
  const owner = ownOAuthActors(errors, cleanupReceipt)
  const queue = owner.queue(() => new Queue<OAuthAuthorizationExchangeJobData>(name, connection))
  const attempts: { claimId: string | undefined; data: OAuthAuthorizationExchangeJobData }[] = []
  const metrics: OAuthContinuationMetrics = {
    decryptCalls: 0,
    providerCalls: 0,
    primary: undefined,
    faultUsed: false,
  }
  let firstFailure: unknown
  let terminalError: unknown
  let terminalFailed = false
  let result: { state: string; data: OAuthAuthorizationExchangeJobData } | undefined
  const injectedError = new Error(`owned ${fault} storage fault`)
  const ownershipFault = { used: false }
  try {
    const events = owner.events(() => new QueueEvents(name, { ...connection, lastEventId: '0' }))
    const terminal = owner.observe(events, jobId)
    await owner.run(() => events.waitUntilReady())
    const worker = owner.worker(
      () =>
        new Worker<OAuthAuthorizationExchangeJobData>(
          name,
          // The production background processor (pause check, handler lookup, rate-limit
          // translation) runs the job; only the provider-facing exchange below is the owned fake.
          createBackgroundProcessor(
            new Map([
              [
                OAUTH_AUTHORIZATION_EXCHANGE_JOB.name,
                backgroundHandler(
                  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
                  (job: Job<OAuthAuthorizationExchangeJobData>) =>
                    owner.run(async () => {
                      owner.assertOpen()
                      await using holder = await beginTransaction()
                      owner.assertOpen()
                      const lock = async () => {
                        await owner.run(() =>
                          holder(
                            '/* runTestOAuthExchangeContinuation */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT',
                            [authorizationId],
                          ),
                        )
                      }
                      attempts.push({ claimId: job.data.exchangeClaimId, data: { ...job.data } })
                      try {
                        if (fault === 'provider-outcome' && attempts.length === 1) await lock()
                        await processOAuthAuthorizationExchangeJob(
                          job,
                          undefined,
                          async (id, _dependencies, ownership) => {
                            if (!ownership)
                              throw new Error('Actual OAuth worker omitted queue ownership')
                            await processOAuthAuthorizationExchange(
                              id,
                              createTestOAuthContinuationDependencies(owner, fault, lock, metrics),
                              {
                                claimId: ownership.claimId,
                                providerRequestArmed: ownership.providerRequestArmed,
                                persist: (claim, providerRequestArmed) =>
                                  owner.run(() =>
                                    createTestOAuthOwnershipPersistence(
                                      authorizationId,
                                      ownership,
                                      fault,
                                      injectedError,
                                      expireOnWriteFailure,
                                      ownershipFault,
                                    )(claim, providerRequestArmed),
                                  ),
                              },
                            )
                          },
                        )
                      } catch (err) {
                        if (attempts.length === 1) firstFailure = err
                        throw err
                      }
                      // await-using holder rollback occurs before the worker schedules its next actual attempt.
                    }),
                ),
              ],
            ]),
          ),
          { ...connection, blockTimeout: 100, promotionInterval: 1000 },
        ),
    )
    worker.on('error', err => {
      errors.push(err)
      terminal.reject(err)
    })
    await owner.run(() => worker.waitUntilReady())
    const job = await owner.run(() =>
      queue.add(
        OAUTH_AUTHORIZATION_EXCHANGE_JOB.name,
        {
          authorizationId,
          ...(recordedClaimId
            ? { exchangeClaimId: recordedClaimId, exchangeProviderRequestArmed: true as const }
            : {}),
        },
        {
          jobId,
          attempts: fault === 'provider-outcome' ? 5 : 2,
          backoff: { type: 'exponential', delay: 250 },
        },
      ),
    )
    if (!job || job.id !== jobId) throw new Error('Expected exact owned continuation job')
    const receipt = await owner.run(() => terminal.promise)
    terminalFailed = receipt.state === 'failed'
    if (terminalFailed) terminalError = new Error(receipt.failedReason)

    const stored = await owner.run(() => queue.getJob(job.id))
    if (!stored) throw new Error('Owned continuation job disappeared')
    const state = await owner.run(() => stored.getState())
    if (state !== receipt.state)
      throw new Error('Owned stream terminal receipt disagrees with job state')
    result = { state, data: stored.data }
  } catch (err) {
    errors.push(err)
  }
  await owner.dispose()
  if (errors.length)
    throw new AggregateError(errors, 'Owned continuation actors failed to drain', {
      cause: errors[0],
    })
  if (!result) throw new Error('No owned continuation terminal receipt')
  return {
    ...result,
    attempts,
    decryptCalls: metrics.decryptCalls,
    providerCalls: metrics.providerCalls,
    primary: metrics.primary,
    firstFailure,
    injectedError,
    terminalFailed,
    terminalError,
  }
}
