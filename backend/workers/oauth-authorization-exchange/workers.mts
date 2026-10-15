import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
} from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import { processOAuthAuthorizationExchangeJob } from './processors/process-job.mts'

export const oauthAuthorizationExchangeHandlers = [
  backgroundHandler(OAUTH_AUTHORIZATION_EXCHANGE_JOB, job =>
    processOAuthAuthorizationExchangeJob(job),
  ),
  backgroundHandler(OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB, job =>
    processOAuthAuthorizationExchangeJob(job),
  ),
]
