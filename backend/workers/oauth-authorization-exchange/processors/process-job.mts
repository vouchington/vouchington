import type { Job } from 'glide-mq'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
  type OAuthAuthorizationExchangeJobData,
} from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import { processOAuthAuthorizationExchange } from '@services/oauth'
import { processDispatchOAuthAuthorizationExchanges } from '../processors.mts'

export async function processOAuthAuthorizationExchangeJob(
  job: Job,
  dispatch: typeof processDispatchOAuthAuthorizationExchanges = processDispatchOAuthAuthorizationExchanges,
  exchange: typeof processOAuthAuthorizationExchange = processOAuthAuthorizationExchange,
): Promise<void> {
  if (job.name === OAUTH_AUTHORIZATION_EXCHANGE_JOB.name) {
    const data: OAuthAuthorizationExchangeJobData = job.data
    await exchange(data.authorizationId, undefined, {
      claimId: data.exchangeClaimId,
      providerRequestArmed: data.exchangeProviderRequestArmed,
      async persist(claimId, providerRequestArmed) {
        await job.updateData({
          authorizationId: data.authorizationId,
          ...(claimId ? { exchangeClaimId: claimId } : {}),
          ...(claimId && providerRequestArmed ? { exchangeProviderRequestArmed: true } : {}),
        })
      },
    })
    return
  }
  if (job.name === OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name) {
    await dispatch()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}
