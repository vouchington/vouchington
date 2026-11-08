import type { Job } from 'glide-mq'
import type { OAuthAuthorizationExchangeJobPayloads } from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import { processOAuthAuthorizationExchange } from '@services/oauth'
import { processDispatchOAuthAuthorizationExchanges } from '../processors.mts'

type OAuthAuthorizationExchangeJob = {
  [TName in keyof OAuthAuthorizationExchangeJobPayloads]: Job<
    OAuthAuthorizationExchangeJobPayloads[TName]
  > & { readonly name: TName }
}[keyof OAuthAuthorizationExchangeJobPayloads]

export async function processOAuthAuthorizationExchangeJob(
  job: OAuthAuthorizationExchangeJob,
  dispatch: typeof processDispatchOAuthAuthorizationExchanges = processDispatchOAuthAuthorizationExchanges,
  exchange: typeof processOAuthAuthorizationExchange = processOAuthAuthorizationExchange,
): Promise<void> {
  const jobName: string = job.name
  if (job.name === 'oauth-authorization-exchange.exchangeOAuthAuthorization') {
    const data = job.data
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
  if (job.name === 'oauth-authorization-exchange.dispatchOAuthAuthorizationExchanges') {
    await dispatch()
    return
  }
  throw new Error(`Unknown job name: ${jobName}`)
}
