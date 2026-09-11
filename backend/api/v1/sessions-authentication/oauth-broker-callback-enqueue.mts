import onError from '@modules/on-error'
import { enqueueOAuthAuthorizationExchange } from '@queues/oauth-authorization-exchange/enqueues'

export async function enqueueInitialOAuthAuthorizationExchangeBestEffort(
  authorizationId: string,
  enqueue: typeof enqueueOAuthAuthorizationExchange = enqueueOAuthAuthorizationExchange,
): Promise<void> {
  try {
    await enqueue(authorizationId)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}
