import type { Queue, QueueEvents, Worker } from 'glide-mq'
import type { OAuthAuthorizationExchangeJobData } from '../queues/oauth-authorization-exchange/types.mts'

/** Independently settle every acquired actor, retaining ordered cleanup failures. */
export async function closeOwnedOAuthContinuation(
  queue: Queue<OAuthAuthorizationExchangeJobData>,
  events: QueueEvents | undefined,
  worker: Worker<OAuthAuthorizationExchangeJobData> | undefined,
  errors: unknown[],
): Promise<void> {
  if (worker) {
    try {
      await worker.close()
    } catch (err) {
      errors.push(err)
    }
  }
  if (events) {
    try {
      await events.close()
    } catch (err) {
      errors.push(err)
    }
  }
  try {
    await queue.obliterate()
  } catch (err) {
    errors.push(err)
  }
  try {
    await queue.close()
  } catch (err) {
    errors.push(err)
  }
}
