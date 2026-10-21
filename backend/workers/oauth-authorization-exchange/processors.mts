import { hasRetainedUnarmedOAuthExchangeClaim } from '@queues/oauth-authorization-exchange/enqueues/recovery'
import {
  getOAuthAuthorizationExchangeWorkLimit,
  getRecoverableOAuthAuthorizationIds,
} from '@services/oauth'
import { enqueueOrReactivateBulkOAuthAuthorizationExchanges } from '@queues/oauth-authorization-exchange/enqueues'

export async function processDispatchOAuthAuthorizationExchanges(
  authorizationIds?: readonly string[],
): Promise<{
  enqueued: number
  hasMore: boolean
}> {
  const recovery = await getRecoverableOAuthAuthorizationIds(
    getOAuthAuthorizationExchangeWorkLimit('authorization_exchange_recovery_batch_size'),
    authorizationIds,
    hasRetainedUnarmedOAuthExchangeClaim,
  )
  if (recovery.ids.length > 0) {
    await enqueueOrReactivateBulkOAuthAuthorizationExchanges(
      recovery.ids.map(authorizationId => ({ authorizationId })),
    )
  }
  return { enqueued: recovery.ids.length, hasMore: recovery.hasMore }
}
