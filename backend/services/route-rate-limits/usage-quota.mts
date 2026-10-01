import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import onError from '@modules/on-error'
import { trackApiUsage, type ApiUsage } from '@services/analytics'
import { isRouteRateLimitEnabled } from './config.mts'
import { USAGE_QUOTA_WINDOW_SECONDS } from './usage-policy.mts'
import type {
  UsageIdentity,
  UsageQuota,
  UsageQuotaCheck,
  UsageSettlement,
  UsageSurface,
} from './usage-types.mts'

// Outcome-based quota, separate from the attempt-based route limiter: that one counts every attempt
// (including rejected ones) to throttle abuse, this one counts only requests the API served, so a
// client is never charged for a failure that was ours. Valkey is the only store; there is no ledger.
const usageLimiter = new RateLimiter({
  prefix: 'usage-quota',
  ttlSeconds: USAGE_QUOTA_WINDOW_SECONDS,
})

// The bucket is the owner and surface, so every credential a user holds draws on one allowance and
// minting more API keys or OAuth grants does not widen it. It never contains a credential.
function usageBucketId(surface: UsageSurface, userId: string): string {
  return `${surface}:user:${userId}`
}

// A 429 was refused before it ran and an actual 5xx is the API's failure, so neither is charged.
// Everything else, including a 4xx the caller caused, is a request the API served.
function usageUnitsForStatus(statusCode: number): number {
  return statusCode === 429 || statusCode >= 500 ? 0 : 1
}

// Read-only: a rejected request must not consume the quota it was rejected for. Fails open.
export async function checkUsageQuota(
  surface: UsageSurface,
  userId: string,
  quota: UsageQuota,
): Promise<UsageQuotaCheck> {
  if (!isRouteRateLimitEnabled()) return { limited: false, retryAfterSeconds: 0 }
  try {
    const limited = await usageLimiter.isRateLimited(
      [usageBucketId(surface, userId)],
      quota.limit,
      quota.windowSeconds,
    )
    return { limited, retryAfterSeconds: limited ? quota.windowSeconds : 0 }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return { limited: false, retryAfterSeconds: 0 }
  }
}

// Charges the quota once the response status is known, then reports the request to analytics. The
// metric is emitted whether or not enforcement is on, so a disabled limiter still measures usage.
export async function settleUsage(settlement: UsageSettlement): Promise<void> {
  const units = usageUnitsForStatus(settlement.statusCode)
  if (units > 0 && isRouteRateLimitEnabled()) {
    try {
      await usageLimiter.add([usageBucketId(settlement.surface, settlement.identity.userId)])
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  trackApiUsage(toApiUsage(settlement, units))
}

function toApiUsage(settlement: UsageSettlement, units: number): ApiUsage {
  return {
    surface: settlement.surface,
    ...identityDimensions(settlement.identity),
    plan: settlement.plan,
    scope_class: settlement.scopeClass,
    unit: 'request',
    units,
    status_code: settlement.statusCode,
    quota_limit: settlement.quota.limit,
    duration_ms: Math.round(settlement.durationMs),
  }
}

function identityDimensions(
  identity: UsageIdentity,
): Pick<ApiUsage, 'credential' | 'user_id' | 'api_key_id' | 'oauth_client_id' | 'oauth_grant_id'> {
  if (identity.credential === 'api_key') {
    return {
      credential: 'api_key',
      user_id: identity.userId,
      api_key_id: identity.apiKeyId,
    }
  }
  return {
    credential: 'oauth',
    user_id: identity.userId,
    oauth_client_id: identity.oauthClientId,
    oauth_grant_id: identity.oauthGrantId,
  }
}
