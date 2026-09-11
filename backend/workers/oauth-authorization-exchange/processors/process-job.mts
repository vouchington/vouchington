import type { Job } from 'glide-mq'
import type { OAuthAuthorizationExchangeJobs } from '@queues/oauth-authorization-exchange/types'
import { processOAuthAuthorizationExchange } from '@services/oauth'
import { processDispatchOAuthAuthorizationExchanges } from '../processors.mts'

export async function processOAuthAuthorizationExchangeJob(job: Job): Promise<void> {
  const name = job.name as OAuthAuthorizationExchangeJobs
  if (name === 'exchangeOAuthAuthorization') {
    await processOAuthAuthorizationExchange(String(job.data.authorizationId))
    return
  }
  if (name === 'dispatchOAuthAuthorizationExchanges') {
    await processDispatchOAuthAuthorizationExchanges()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}
