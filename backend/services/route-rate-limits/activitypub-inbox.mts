import {
  loadScript,
  RateLimiter,
  rateLimiterValkeyClient,
  registerScript,
} from '@data-stores/valkey-rate-limiter'
import { retrySaturationError } from 'valkyries'
import onError from '@modules/on-error'
import {
  getActivityPubInboxAttemptMaxRequests,
  getActivityPubInboxAttemptWindowSeconds,
  getActivityPubInboxMaxRequests,
  getActivityPubInboxWindowSeconds,
} from './config.mts'

const activityPubInboxAttemptRateLimiter = new RateLimiter({
  prefix: 'activitypub-inbox-attempt-ip',
  ttlSeconds: 60,
})

const activityPubInboxRateLimiter = new RateLimiter({
  prefix: 'activitypub-inbox-sender',
  ttlSeconds: 60,
})
const activityPubInboxSenderAddOnceScript = registerScript(
  loadScript('activitypub-inbox-sender-add-once.lua', import.meta.url),
)

export async function recordActivityPubInboxAttempt(sourceIp: string): Promise<boolean> {
  try {
    const { limited } = await activityPubInboxAttemptRateLimiter.addAndCheck(
      [sourceIp],
      getActivityPubInboxAttemptMaxRequests() + 1,
      getActivityPubInboxAttemptWindowSeconds(),
    )
    return limited
  } catch (err) /* v8 ignore next 3 */ {
    onError(err instanceof Error ? err : new Error(String(err)))
    return false
  }
}

export async function isActivityPubInboxSenderRateLimited(
  senderHostname: string,
): Promise<boolean> {
  try {
    return await activityPubInboxRateLimiter.isRateLimited(
      [senderHostname],
      getActivityPubInboxMaxRequests() + 1,
      getActivityPubInboxWindowSeconds(),
    )
  } catch (err) /* v8 ignore next 3 */ {
    onError(err instanceof Error ? err : new Error(String(err)))
    return false
  }
}

export async function recordActivityPubInboxSenderDelivery(
  senderHostname: string,
): Promise<boolean> {
  try {
    const { limited } = await activityPubInboxRateLimiter.addAndCheck(
      [senderHostname],
      getActivityPubInboxMaxRequests() + 1,
      getActivityPubInboxWindowSeconds(),
    )
    return limited
  } catch (err) /* v8 ignore next 3 */ {
    onError(err instanceof Error ? err : new Error(String(err)))
    return false
  }
}

export async function recordActivityPubInboxSenderDeliveryOnce(
  senderHostname: string,
  deliveryId: string,
): Promise<boolean> {
  try {
    const result = await retrySaturationError(() =>
      rateLimiterValkeyClient.invokeScript(activityPubInboxSenderAddOnceScript, {
        keys: [activityPubInboxRateLimiter.getKey(senderHostname)],
        args: [
          deliveryId,
          String(getActivityPubInboxMaxRequests() + 1),
          String(getActivityPubInboxWindowSeconds()),
        ],
      }),
    )
    return normalizeActivityPubInboxSenderLimitResult(result)
  } catch (err) /* v8 ignore next 3 -- the internal Valkey boundary is exercised with real Valkey */ {
    onError(err instanceof Error ? err : new Error(String(err)))
    return false
  }
}

export function normalizeActivityPubInboxSenderLimitResult(result: unknown): boolean {
  if (result === 0 || result === 0n) return false
  if (result === 1 || result === 1n) return true
  throw new Error(`Unexpected ActivityPub inbox sender-limit result: ${String(result)}`)
}
