import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
  type OAuthAuthorizationExchangeJobData,
} from '../queues/background/enqueues/oauth-authorization-exchange-jobs.mts'
import { hasRetainedUnarmedOAuthExchangeClaim } from '../queues/oauth-authorization-exchange/enqueues/recovery.mts'
import { getRecoverableOAuthAuthorizationIds } from '../services/oauth/authorization-exchange-recovery.mts'
import { processOAuthAuthorizationExchangeJob } from '../workers/oauth-authorization-exchange/processors/process-job.mts'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../data-stores/valkey-core/glide-mq-client.mts'
import { withTestOAuthAuthorizationRowLocked } from './entities/oauth-authorization-recovery.mts'
import { getTestOAuthAuthorization } from './entities/oauth-authorizations.mts'
import {
  ownOAuthActors,
  type createOAuthActorCleanupReceipt,
} from './oauth-exchange-actor-owner.mts'

/** Real failed job/claim join before recovery and actual public retry; never infer admission from a requested bulk position. */
export async function recoverTestRetainedOAuthClaim(
  authorizationId: string,
  claimId: string,
  marker: 'unarmed' | 'armed' | 'foreign-claim',
  cleanupReceipt: ReturnType<typeof createOAuthActorCleanupReceipt>,
) {
  const name = `oauth_retained_${randomUUID()}`
  const options = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const errors: unknown[] = []
  const owner = ownOAuthActors(errors, cleanupReceipt)
  const queue = owner.queue(() => new Queue<OAuthAuthorizationExchangeJobData>(name, options))
  const nativeErrors: unknown[] = []
  let firstNativeError: unknown
  let firstAttempts = 0
  let outcome:
    | {
        recovered: { ids: string[]; hasMore: boolean }
        before: Awaited<ReturnType<typeof getTestOAuthAuthorization>>
        after: Awaited<ReturnType<typeof getTestOAuthAuthorization>>
        firstState: string
        secondState?: string
        data?: OAuthAuthorizationExchangeJobData
      }
    | undefined
  try {
    const events = owner.events(() => new QueueEvents(name, { ...options, lastEventId: '0' }))
    const firstTerminal = owner.observe(events, authorizationId)
    await owner.run(() => events.waitUntilReady())
    const firstWorker = owner.worker(
      () =>
        new Worker<OAuthAuthorizationExchangeJobData>(
          name,
          async (job: Job<OAuthAuthorizationExchangeJobData>) => {
            firstAttempts += 1
            try {
              await owner.run(() =>
                withTestOAuthAuthorizationRowLocked(authorizationId, () =>
                  processOAuthAuthorizationExchangeJob(job),
                ),
              )
            } catch (err) {
              nativeErrors.push(err)
              if (firstAttempts === 1) firstNativeError = err
              throw err
            }
          },
          { ...options, blockTimeout: 100, promotionInterval: 1000 },
        ),
    )
    firstWorker.on('error', err => {
      errors.push(err)
      firstTerminal.reject(err)
    })
    await owner.run(() => firstWorker.waitUntilReady())
    const added = await owner.run(() =>
      queue.add(
        OAUTH_AUTHORIZATION_EXCHANGE_JOB.name,
        {
          authorizationId,
          exchangeClaimId: marker === 'foreign-claim' ? randomUUID() : claimId,
          ...(marker === 'armed' ? { exchangeProviderRequestArmed: true as const } : {}),
        },
        { jobId: authorizationId, attempts: 1 },
      ),
    )
    if (!added || added.id !== authorizationId)
      throw new Error('Exact retained owned job was not admitted')
    const firstReceipt = await owner.run(() => firstTerminal.promise)
    if (firstReceipt.state !== 'failed')
      throw new Error('Actual NOWAIT contention did not fail the retained job')
    // Five actual public reactivations/attempts; each next admission follows its prior terminal receipt.
    // One configured attempt per reactivation keeps the later disposition attempt independently observable.
    for (let attempt = 1; attempt < 5; attempt += 1) {
      const nextTerminal = owner.observe(events, authorizationId)
      await owner.run(() => added.retry())
      const receipt = await owner.run(() => nextTerminal.promise)
      if (receipt.state !== 'failed')
        throw new Error('Owned row contention unexpectedly completed a queue attempt')
    }
    await owner.run(() => firstWorker.close())
    const retained = await owner.run(() => queue.getJob(authorizationId))
    if (!retained) throw new Error('Actual failed job lost its ownership')
    const firstState = await owner.run(() => retained.getState())
    if (firstState !== 'failed')
      throw new Error('Retained terminal receipt disagrees with actual job state')
    const recovered = await owner.run(() =>
      getRecoverableOAuthAuthorizationIds(1, [authorizationId], (id, claim) =>
        hasRetainedUnarmedOAuthExchangeClaim(id, claim, queue),
      ),
    )
    const before = await owner.run(() => getTestOAuthAuthorization(authorizationId))
    let secondState: string | undefined
    let data: OAuthAuthorizationExchangeJobData | undefined
    if (marker === 'unarmed') {
      const secondTerminal = owner.observe(events, authorizationId)
      const secondWorker = owner.worker(
        () =>
          new Worker<OAuthAuthorizationExchangeJobData>(
            name,
            (job: Job<OAuthAuthorizationExchangeJobData>) =>
              owner.run(() => processOAuthAuthorizationExchangeJob(job)),
            { ...options, blockTimeout: 100, promotionInterval: 1000 },
          ),
      )
      secondWorker.on('error', err => {
        errors.push(err)
        secondTerminal.reject(err)
      })
      await owner.run(() => secondWorker.waitUntilReady())
      await owner.run(() => retained.retry())
      const secondReceipt = await owner.run(() => secondTerminal.promise)
      const afterJob = await owner.run(() => queue.getJob(authorizationId))
      if (!afterJob) throw new Error('Retried owned job disappeared')
      secondState = await owner.run(() => afterJob.getState())
      if (secondState !== secondReceipt.state)
        throw new Error('Retried owned terminal receipt disagrees with job state')
      data = afterJob.data
    }
    outcome = {
      recovered,
      before,
      after: await owner.run(() => getTestOAuthAuthorization(authorizationId)),
      firstState,
      secondState,
      data,
    }
  } catch (err) {
    errors.push(err)
  }
  await owner.dispose()
  if (errors.length)
    throw new AggregateError(errors, 'Retained OAuth claim actors failed to drain', {
      cause: errors[0],
    })
  if (!outcome) throw new Error('No retained OAuth claim receipt')
  return { ...outcome, firstNativeError, firstAttempts, nativeErrors }
}
