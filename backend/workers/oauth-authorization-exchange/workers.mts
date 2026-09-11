import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME } from '@queues/oauth-authorization-exchange/config'
import { processOAuthAuthorizationExchangeJob } from './processors/process-job.mts'

export const oauthAuthorizationExchangeWorker = createWorker(
  OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
  processOAuthAuthorizationExchangeJob,
  {
    concurrency: getWorkerConcurrency('oauthAuthorizationExchange', {
      baseline: 4,
      ignoreScale: true,
    }),
  },
)
