import { OAUTH_AUTHORIZATION_EXCHANGE_JOB } from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import type { Queue } from 'glide-mq'
import { oauthAuthorizationExchangeQueue } from '../queues.mts'

/** A retained exact unarmed job proves that its next attempt is disposition-only, not provider replay. */
export async function hasRetainedUnarmedOAuthExchangeClaim(
  authorizationId: string,
  claimId: string,
  queue: Pick<Queue<unknown>, 'getJob'> = oauthAuthorizationExchangeQueue,
): Promise<boolean> {
  const job = await queue.getJob(authorizationId)
  if (
    !job ||
    job.id !== authorizationId ||
    job.name !== OAUTH_AUTHORIZATION_EXCHANGE_JOB.name ||
    typeof job.data !== 'object' ||
    job.data === null ||
    !('authorizationId' in job.data) ||
    job.data.authorizationId !== authorizationId ||
    !('exchangeClaimId' in job.data) ||
    job.data.exchangeClaimId !== claimId ||
    ('exchangeProviderRequestArmed' in job.data &&
      job.data.exchangeProviderRequestArmed !== undefined)
  )
    return false
  const state = await job.getState()
  return ['failed', 'active', 'waiting', 'prioritized', 'delayed'].includes(state)
}
