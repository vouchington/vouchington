import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Exchanges share the domain lane; the recovery dispatcher has a separate singleton lane.
export const OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN = defineBackgroundDomain({
  domain: 'oauth-authorization-exchange',
  deferral: 'job',
  workerConcurrency: 4,
})

export type OAuthAuthorizationExchangeJobData = {
  authorizationId: string
  /** Write-ahead ownership only; never provider credentials, tokens or errors. */
  exchangeClaimId?: string
  /** Persisted before provider admission; an interrupted request has an unknown outcome. */
  exchangeProviderRequestArmed?: true
}

export const OAUTH_AUTHORIZATION_EXCHANGE_JOB =
  defineBackgroundJob<OAuthAuthorizationExchangeJobData>(OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN, {
    name: 'exchangeOAuthAuthorization',
    priority: PRIORITY_TASK,
    attempts: 5,
    backoff: { type: 'exponential', delay: 250 },
    removeOnComplete: 100,
    removeOnFail: 100,
  })

export const OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB = defineBackgroundJob(
  OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN,
  {
    name: 'dispatchOAuthAuthorizationExchanges',
    priority: PRIORITY_DISPATCH,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
)

export const OAUTH_AUTHORIZATION_EXCHANGE_JOBS = [
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
] as const
