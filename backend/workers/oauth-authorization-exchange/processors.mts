import { getRecoverableOAuthAuthorizationIds } from '@services/oauth'
import { enqueueOrReactivateBulkOAuthAuthorizationExchanges } from '@queues/oauth-authorization-exchange/enqueues'

export async function processDispatchOAuthAuthorizationExchanges(): Promise<{
  enqueued: number
}> {
  const authorizationIds = await getRecoverableOAuthAuthorizationIds()
  if (authorizationIds.length > 0) {
    await enqueueOrReactivateBulkOAuthAuthorizationExchanges(
      authorizationIds.map(authorizationId => ({ authorizationId })),
    )
  }
  return { enqueued: authorizationIds.length }
}
