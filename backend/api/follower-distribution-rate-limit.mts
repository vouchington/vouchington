import type { Context } from '@jongleberry/api-server'
import { checkFollowerDistributionSenderRateLimit } from '@services/route-rate-limits/follower-distributions'

export async function enforceFollowerDistributionSenderRateLimit(
  ctx: Context,
  senderUserId: string,
): Promise<void> {
  const result = await checkFollowerDistributionSenderRateLimit(senderUserId)
  if (result.limited) {
    ctx.set('Retry-After', String(result.retryAfterSeconds))
    ctx.throw(429, 'Rate limit exceeded. Please try again later.')
  }
}
