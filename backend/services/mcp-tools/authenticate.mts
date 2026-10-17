import { validateApiKeyForUserMcp } from '@services/api-keys/validate'
import {
  isOAuthAccessToken,
  validateOAuthAccessToken,
} from '@services/oauth-authorization-server/access-tokens'
import { getPrivateUserByAny, type PrivateUser } from '@services/users'
import { getLoadedMembershipPlan } from '@services/users/loaded-membership-plan'
import { hasEveryScope, type ApiScope } from '@modules/scopes'
import type { McpServerConfig } from './config.mts'

const BEARER_CREDENTIAL_PATTERN = /^Bearer +([A-Za-z0-9\-._~+/]+=*) *$/i

type McpVerifiedCredential =
  | {
      credential: 'api_key'
      oauthClientId: null
      apiKeyId: string
      rateLimitIdentity: { apiKeyId: string }
    }
  | {
      credential: 'oauth'
      oauthClientId: string
      oauthGrantId: string
      oauthClientRowId: string
      rateLimitIdentity: { userId: string }
    }

export type McpBearerAuthentication =
  | { status: 'missing' }
  | { status: 'invalid' }
  | (McpVerifiedCredential & {
      status: 'authenticated'
      owner: PrivateUser
      scopes: ApiScope[]
      // True for an admitted suspended member on the user server.
      suspended: boolean
    })

// One authenticator for both MCP routes. The token prefix picks the verifier, so an OAuth token is
// only checked against this route's resource. A route that does not accept API keys (the admin
// route) never looks a non-OAuth credential up, so a leaked or stale key is indistinguishable from
// any other unrecognized token.
export async function authenticateMcpBearer(
  authorization: string | undefined,
  config: McpServerConfig,
): Promise<McpBearerAuthentication> {
  const rawToken = authorization ? BEARER_CREDENTIAL_PATTERN.exec(authorization)?.[1] : undefined
  if (!rawToken) return { status: 'missing' }
  const verified = await verifyMcpBearerToken(rawToken, config)
  if (!verified) return { status: 'invalid' }
  // Suspension and plan are the authorization decision. The primary read keeps a replica
  // from serving a just-suspended owner or a plan that has already lapsed.
  const owner = await getPrivateUserByAny(verified.userId, { readOnly: false })
  if (!owner) return { status: 'invalid' }
  // Suspension is decided here for OAuth and API keys, on every request. Access-token validation
  // and refresh rotation do not look at it. A new authorization still rejects a suspended user.
  const suspended = owner.suspended_at != null
  const plan = getLoadedMembershipPlan(owner)
  const paying = plan === 'plus' || plan === 'pro'
  const canReadMessages = hasEveryScope(verified.scopes, ['messages:read'])
  if (suspended && !(config.audience === 'user' && (paying || canReadMessages)))
    return { status: 'invalid' }
  return {
    status: 'authenticated',
    owner,
    scopes: verified.scopes,
    suspended,
    ...verified.credential,
  }
}

async function verifyMcpBearerToken(
  rawToken: string,
  config: McpServerConfig,
): Promise<{ credential: McpVerifiedCredential; scopes: ApiScope[]; userId: string } | null> {
  if (isOAuthAccessToken(rawToken)) {
    const principal = await validateOAuthAccessToken(rawToken, config.audience)
    if (!principal) return null
    return {
      credential: {
        credential: 'oauth',
        oauthClientId: principal.client_id,
        oauthGrantId: principal.grant_id,
        oauthClientRowId: principal.oauth_client_id,
        rateLimitIdentity: { userId: principal.user_id },
      },
      scopes: principal.scopes,
      userId: principal.user_id,
    }
  }
  if (!config.acceptsApiKeys) return null
  const { valid, apiKey } = await validateApiKeyForUserMcp(rawToken)
  if (!valid || !apiKey) return null
  return {
    credential: {
      credential: 'api_key',
      oauthClientId: null,
      apiKeyId: apiKey.id,
      rateLimitIdentity: { apiKeyId: apiKey.id },
    },
    scopes: apiKey.permissions,
    userId: apiKey.user_id,
  }
}
