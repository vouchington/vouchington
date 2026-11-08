import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
  type OAuthAuthorizationExchangeJobPayloads,
} from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import { processOAuthAuthorizationExchangeJob } from './processors/process-job.mts'
import type { Job } from 'glide-mq'

type OAuthAuthorizationExchangeJob = {
  [TName in keyof OAuthAuthorizationExchangeJobPayloads]: Job<
    OAuthAuthorizationExchangeJobPayloads[TName]
  > & { readonly name: TName }
}[keyof OAuthAuthorizationExchangeJobPayloads]

function processRegisteredOAuthJob<TData>(job: Job<TData>): Promise<void> {
  return processOAuthAuthorizationExchangeJob(job as unknown as OAuthAuthorizationExchangeJob)
}

export const oauthAuthorizationExchangeHandlers = [
  backgroundHandler(OAUTH_AUTHORIZATION_EXCHANGE_JOB, processRegisteredOAuthJob),
  backgroundHandler(OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB, processRegisteredOAuthJob),
]
