import {
  loadScript,
  RateLimiter,
  rateLimiterValkeyClient,
  registerScript,
  retryRateLimiterSaturation,
} from '@data-stores/valkey-rate-limiter'
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

export type ActivityPubInboxRateLimitDependencies = {
  limiter: Pick<RateLimiter, 'addAndCheck' | 'isRateLimited'>
  reportError: (error: Error) => void
}

const defaultDependencies: ActivityPubInboxRateLimitDependencies = {
  limiter: activityPubInboxRateLimiter,
  reportError: onError,
}

const defaultAttemptDependencies: ActivityPubInboxRateLimitDependencies = {
  limiter: activityPubInboxAttemptRateLimiter,
  reportError: onError,
}

export async function isActivityPubInboxAttemptRateLimited(
  sourceIp: string,
  dependencies: ActivityPubInboxRateLimitDependencies = defaultAttemptDependencies,
): Promise<boolean> {
  try {
    return await dependencies.limiter.isRateLimited(
      [sourceIp],
      getActivityPubInboxAttemptMaxRequests() + 1,
      getActivityPubInboxAttemptWindowSeconds(),
    )
  } catch (error) /* v8 ignore next 3 */ {
    dependencies.reportError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export async function recordActivityPubInboxAttempt(
  sourceIp: string,
  dependencies: ActivityPubInboxRateLimitDependencies = defaultAttemptDependencies,
): Promise<boolean> {
  try {
    const { limited } = await dependencies.limiter.addAndCheck(
      [sourceIp],
      getActivityPubInboxAttemptMaxRequests() + 1,
      getActivityPubInboxAttemptWindowSeconds(),
    )
    return limited
  } catch (error) /* v8 ignore next 3 */ {
    dependencies.reportError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export async function isActivityPubInboxSenderRateLimited(
  senderHostname: string,
  dependencies: ActivityPubInboxRateLimitDependencies = defaultDependencies,
): Promise<boolean> {
  try {
    return await dependencies.limiter.isRateLimited(
      [senderHostname],
      getActivityPubInboxMaxRequests() + 1,
      getActivityPubInboxWindowSeconds(),
    )
  } catch (error) /* v8 ignore next 3 */ {
    dependencies.reportError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export async function recordActivityPubInboxSenderDelivery(
  senderHostname: string,
  dependencies: ActivityPubInboxRateLimitDependencies = defaultDependencies,
): Promise<boolean> {
  try {
    const { limited } = await dependencies.limiter.addAndCheck(
      [senderHostname],
      getActivityPubInboxMaxRequests() + 1,
      getActivityPubInboxWindowSeconds(),
    )
    return limited
  } catch (error) /* v8 ignore next 3 */ {
    dependencies.reportError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export async function recordActivityPubInboxSenderDeliveryOnce(
  senderHostname: string,
  deliveryId: string,
  dependencies: Pick<ActivityPubInboxRateLimitDependencies, 'reportError'> = defaultDependencies,
): Promise<boolean> {
  try {
    const result = await retryRateLimiterSaturation(() =>
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
  } catch (error) /* v8 ignore next 3 -- the internal Valkey boundary is exercised with real Valkey */ {
    dependencies.reportError(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

export function normalizeActivityPubInboxSenderLimitResult(result: unknown): boolean {
  if (result === 0 || result === 0n) return false
  if (result === 1 || result === 1n) return true
  throw new Error(`Unexpected ActivityPub inbox sender-limit result: ${String(result)}`)
}
