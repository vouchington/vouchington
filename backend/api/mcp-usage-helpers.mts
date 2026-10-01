import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import type { authenticateMcpBearer, McpServerConfig } from '@services/mcp-tools'
import {
  checkUsageQuota,
  resolveUsagePlan,
  resolveUsageScopeClass,
  selectUsageQuota,
  settleUsage,
  type UsageIdentity,
  type UsageQuotaCheck,
  type UsageSurface,
} from '@services/route-rate-limits'

type AuthenticatedMcpCredential = Extract<
  Awaited<ReturnType<typeof authenticateMcpBearer>>,
  { status: 'authenticated' }
>

export type McpUsageMeter = {
  // Read-only: a request refused here is never charged to the quota it was refused for.
  checkQuota: () => Promise<UsageQuotaCheck>
}

// Meters one request of a verified credential. The quota is charged, and the usage event emitted,
// when the response closes, because only then is the real status known: a 2xx or 4xx is charged, a
// 429 or an actual 5xx is not. The identity is the validated user, API key id, OAuth client id and
// grant id; the raw bearer token is never read here. A client that disconnects before any response
// header was sent has no status to charge or report, so it is skipped.
export function startMcpUsageMeter(
  ctx: Context,
  config: McpServerConfig,
  authentication: AuthenticatedMcpCredential,
): McpUsageMeter {
  const startedAt = performance.now()
  const surface: UsageSurface = config.audience === 'admin' ? 'mcp_admin' : 'mcp_user'
  const identity = usageIdentity(authentication)
  const plan = resolveUsagePlan(authentication.owner)
  const scopeClass = resolveUsageScopeClass(authentication.scopes)
  const quota = selectUsageQuota({ surface, plan, scopeClass })

  ctx.res.once('close', () => {
    if (!ctx.res.headersSent) return
    settleUsage({
      surface,
      identity,
      plan,
      scopeClass,
      quota,
      statusCode: ctx.res.statusCode,
      durationMs: performance.now() - startedAt,
    }).catch(error => onError(error instanceof Error ? error : new Error(String(error))))
  })

  return { checkQuota: () => checkUsageQuota(surface, identity.userId, quota) }
}

function usageIdentity(authentication: AuthenticatedMcpCredential): UsageIdentity {
  const userId = authentication.owner.id
  if (authentication.credential === 'api_key') {
    return { credential: 'api_key', userId, apiKeyId: authentication.apiKeyId }
  }
  return {
    credential: 'oauth',
    userId,
    oauthClientId: authentication.oauthClientId,
    oauthGrantId: authentication.oauthGrantId,
  }
}
