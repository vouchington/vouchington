import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import onError from '@modules/on-error'
import {
  getFollowerDistributionMaxRequests,
  getFollowerDistributionWindowSeconds,
  isRouteRateLimitEnabled,
} from './config.mts'

const senderRateLimiter = new RateLimiter({
  prefix: 'follower-distribution-sender',
  ttlSeconds: 60,
})

export async function checkFollowerDistributionSenderRateLimit(senderUserId: string) {
  if (!isRouteRateLimitEnabled()) return { limited: false, retryAfterSeconds: 0 }

  const windowSeconds = getFollowerDistributionWindowSeconds()
  try {
    const { limited } = await senderRateLimiter.addAndCheck(
      [senderUserId],
      getFollowerDistributionMaxRequests() + 1,
      windowSeconds,
    )
    return { limited, retryAfterSeconds: windowSeconds }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return { limited: false, retryAfterSeconds: 0 }
  }
}
