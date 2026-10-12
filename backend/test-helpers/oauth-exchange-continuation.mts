import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import { beginTransaction } from '@data-stores/psql'
import { observeOAuthExchangeTerminal } from './oauth-exchange-terminal.mts'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../data-stores/valkey-core/glide-mq-client.mts'
import type { OAuthAuthorizationExchangeJobData } from '../queues/oauth-authorization-exchange/types.mts'
import { processOAuthAuthorizationExchangeJob } from '../workers/oauth-authorization-exchange/processors/process-job.mts'
import { processOAuthAuthorizationExchange } from '../services/oauth/authorization-exchange.mts'
import {
  claimOAuthAuthorizationExchange,
  rejectExhaustedOAuthAuthorizationExchange,
  releaseOAuthAuthorizationExchangeClaim,
} from '../services/oauth/authorization-exchange-state.mts'
import {
  decryptOAuthAuthorizationCode,
  decryptOAuthAuthorizationPkceVerifier,
} from '../services/oauth/authorization-broker.mts'
import { upsertFacebookAuthorizationCodeAccount } from '../services/oauth-facebook/index.mts'
import { upsertGithubAccount } from '../services/oauth-github/index.mts'
import { upsertXAccount } from '../services/oauth-x/index.mts'

export type OAuthContinuationFault = 'rejection' | 'release' | 'ownership-write' | 'clear-write'

/** Real queue attempts, real claim/decrypt/mutations, and an actual second PostgreSQL connection. */
export async function runTestOAuthExchangeContinuation(
  authorizationId: string,
  fault: OAuthContinuationFault,
) {
  const name = `oauth_continuation_${randomUUID()}`
  const jobId = randomUUID()
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const queue = new Queue<OAuthAuthorizationExchangeJobData>(name, connection)
  let events: QueueEvents | undefined
  let worker: Worker<OAuthAuthorizationExchangeJobData> | undefined
  const errors: unknown[] = []
  const attempts: { claimId: string | undefined; data: OAuthAuthorizationExchangeJobData }[] = []
  let decryptCalls = 0
  let providerCalls = 0
  let primary: unknown
  let firstFailure: unknown
  let terminalError: unknown
  let terminalFailed = false
  let result: { state: string; data: OAuthAuthorizationExchangeJobData } | undefined
  const injectedError = new Error(`owned ${fault} storage fault`)
  let faultUsed = false
  try {
    events = new QueueEvents(name, { ...connection, lastEventId: '0' })
    const terminal = observeOAuthExchangeTerminal(events, jobId, err => errors.push(err))
    await events.waitUntilReady()
    worker = new Worker<OAuthAuthorizationExchangeJobData>(
      name,
      async (job: Job<OAuthAuthorizationExchangeJobData>) => {
        await using holder = await beginTransaction()
        const lock = async () => {
          await holder('SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT', [
            authorizationId,
          ])
        }
        attempts.push({ claimId: job.data.exchangeClaimId, data: { ...job.data } })
        try {
          await processOAuthAuthorizationExchangeJob(
            job,
            undefined,
            async (id, _dependencies, ownership) => {
              if (!ownership) throw new Error('Actual OAuth worker omitted queue ownership')
              await processOAuthAuthorizationExchange(
                id,
                {
                  claim: claimOAuthAuthorizationExchange,
                  decryptCode(id, ciphertext) {
                    decryptCalls += 1
                    try {
                      return decryptOAuthAuthorizationCode(id, ciphertext)
                    } catch (err) {
                      primary = err
                      throw err
                    }
                  },
                  decryptVerifier: decryptOAuthAuthorizationPkceVerifier,
                  upsertFacebook(...args) {
                    providerCalls += 1
                    return upsertFacebookAuthorizationCodeAccount(...args)
                  },
                  upsertGithub(...args) {
                    providerCalls += 1
                    return upsertGithubAccount(...args)
                  },
                  upsertX(...args) {
                    providerCalls += 1
                    return upsertXAccount(...args)
                  },
                  async rejectExhausted(id, claimId) {
                    if (fault === 'rejection' && !faultUsed) {
                      faultUsed = true
                      await lock()
                    }
                    const rejected = await rejectExhaustedOAuthAuthorizationExchange(id, claimId)
                    if (fault === 'release' && !faultUsed) {
                      faultUsed = true
                      await lock()
                    }
                    return rejected
                  },
                  releaseClaim: releaseOAuthAuthorizationExchangeClaim,
                },
                {
                  claimId: ownership.claimId,
                  async persist(claimId) {
                    if (
                      !faultUsed &&
                      ((fault === 'ownership-write' && claimId) ||
                        (fault === 'clear-write' && !claimId))
                    ) {
                      faultUsed = true
                      throw injectedError
                    }
                    await ownership.persist(claimId)
                  },
                },
              )
            },
          )
        } catch (err) {
          if (attempts.length === 1) firstFailure = err
          throw err
        }
        // await-using holder rollback occurs before the worker schedules its next actual attempt.
      },
      { ...connection, blockTimeout: 1000 },
    )
    worker.on('error', err => {
      errors.push(err)
      terminal.reject(err)
    })
    await worker.waitUntilReady()
    const job = await queue.add(
      'exchangeOAuthAuthorization',
      { authorizationId },
      { jobId, attempts: 2, backoff: { type: 'exponential', delay: 250 } },
    )
    if (!job || job.id !== jobId) throw new Error('Expected exact owned continuation job')
    const receipt = await terminal.promise
    terminalFailed = receipt.state === 'failed'
    if (terminalFailed) terminalError = new Error(receipt.failedReason)

    const stored = await queue.getJob(job.id)
    if (!stored) throw new Error('Owned continuation job disappeared')
    const state = await stored.getState()
    if (state !== receipt.state)
      throw new Error('Owned stream terminal receipt disagrees with job state')
    result = { state, data: stored.data }
  } catch (err) {
    errors.push(err)
  }
  // Every acquired handle is settled independently; never throw from finally or force-close.
  if (worker) {
    try {
      await worker.close()
    } catch (err) {
      errors.push(err)
    }
  }
  if (events) {
    try {
      await events.close()
    } catch (err) {
      errors.push(err)
    }
  }
  try {
    await queue.obliterate()
  } catch (err) {
    errors.push(err)
  }
  try {
    await queue.close()
  } catch (err) {
    errors.push(err)
  }
  if (errors.length)
    throw new AggregateError(errors, 'Owned continuation actors failed to drain', {
      cause: errors[0],
    })
  if (!result) throw new Error('No owned continuation terminal receipt')
  return {
    ...result,
    attempts,
    decryptCalls,
    providerCalls,
    primary,
    firstFailure,
    injectedError,
    terminalFailed,
    terminalError,
  }
}
