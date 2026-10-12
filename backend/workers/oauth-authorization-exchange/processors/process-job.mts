import type { Job } from 'glide-mq'
import type {
  OAuthAuthorizationExchangeJobData,
  OAuthAuthorizationExchangeJobs,
} from '@queues/oauth-authorization-exchange/types'
import { processOAuthAuthorizationExchange } from '@services/oauth'
import { processDispatchOAuthAuthorizationExchanges } from '../processors.mts'

export async function processOAuthAuthorizationExchangeJob(
  job: Job,
  dispatch: typeof processDispatchOAuthAuthorizationExchanges = processDispatchOAuthAuthorizationExchanges,
  exchange: typeof processOAuthAuthorizationExchange = processOAuthAuthorizationExchange,
): Promise<void> {
  const name = job.name as OAuthAuthorizationExchangeJobs
  if (name === 'exchangeOAuthAuthorization') {
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
  if (name === 'dispatchOAuthAuthorizationExchanges') {
    await dispatch()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}
