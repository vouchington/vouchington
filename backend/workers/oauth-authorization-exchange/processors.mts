import { getRecoverableOAuthAuthorizationIds } from '@services/oauth'
import { enqueueOrReactivateBulkOAuthAuthorizationExchanges } from '@queues/oauth-authorization-exchange/enqueues'

export async function processDispatchOAuthAuthorizationExchanges(
  authorizationIds?: readonly string[],
): Promise<{
  enqueued: number
}> {
  const recoverableIds = await getRecoverableOAuthAuthorizationIds(500, authorizationIds)
  if (recoverableIds.length > 0) {
    await enqueueOrReactivateBulkOAuthAuthorizationExchanges(
      recoverableIds.map(authorizationId => ({ authorizationId })),
    )
  }
  return { enqueued: recoverableIds.length }
}
