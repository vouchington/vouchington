import type { Context } from '@jongleberry/api-server'
import type { authenticateMcpBearer, McpServerConfig } from '@services/mcp-tools'
import {
  checkUsageQuota,
  resolveUsagePlan,
  resolveUsageScopeClass,
  selectUsageQuota,
  type UsageIdentity,
  type UsageQuotaCheck,
  type UsageSurface,
} from '@services/route-rate-limits'
import { settleUsageOnClose } from './usage-meter-helpers.mts'

type AuthenticatedMcpCredential = Extract<
  Awaited<ReturnType<typeof authenticateMcpBearer>>,
  { status: 'authenticated' }
>

export type McpUsageMeter = {
  // Read-only: a request refused here is never charged to the quota it was refused for.
  checkQuota: () => Promise<UsageQuotaCheck>
}

// Meters one request of a verified credential, settling when the response closes (see
// `settleUsageOnClose`). The identity is the validated user, API key id, OAuth client id and grant
// id; the raw bearer token is never read here.
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

  settleUsageOnClose(ctx, { surface, identity, plan, scopeClass, quota }, startedAt)

  return { checkQuota: () => checkUsageQuota(surface, identity.userId, quota) }
}

function usageIdentity(
  authentication: AuthenticatedMcpCredential,
): Extract<UsageIdentity, { userId: string }> {
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
