import { validateApiKeyForMcpAudience } from '@services/api-keys/validate'
import { isOAuthAccessToken, validateOAuthAccessToken } from '@services/oauth-authorization-server'
import { getPrivateUserByAny, type PrivateUser } from '@services/users'
import type { ApiScope } from '@modules/scopes'
import type { McpServerConfig } from './config.mts'

const BEARER_CREDENTIAL_PATTERN = /^Bearer +([A-Za-z0-9\-._~+/]+=*) *$/i

type McpVerifiedCredential =
  | { credential: 'api_key'; rateLimitIdentity: { apiKeyId: string } }
  | { credential: 'oauth'; rateLimitIdentity: { userId: string } }

export type McpBearerAuthentication =
  | { status: 'missing' }
  | { status: 'invalid' }
  | (McpVerifiedCredential & {
      status: 'authenticated'
      owner: PrivateUser
      scopes: ApiScope[]
    })

// One authenticator for both MCP routes. The token prefix picks the verifier, so an OAuth token is
// only checked against this route's resource and an API key only against this route's audience.
export async function authenticateMcpBearer(
  authorization: string | undefined,
  config: McpServerConfig,
): Promise<McpBearerAuthentication> {
  const rawToken = authorization ? BEARER_CREDENTIAL_PATTERN.exec(authorization)?.[1] : undefined
  if (!rawToken) return { status: 'missing' }
  const verified = await verifyMcpBearerToken(rawToken, config)
  if (!verified) return { status: 'invalid' }
  const owner = await getPrivateUserByAny(verified.userId)
  if (!owner || owner.suspended_at) return { status: 'invalid' }
  return { status: 'authenticated', owner, scopes: verified.scopes, ...verified.credential }
}

async function verifyMcpBearerToken(
  rawToken: string,
  config: McpServerConfig,
): Promise<{ credential: McpVerifiedCredential; scopes: ApiScope[]; userId: string } | null> {
  if (isOAuthAccessToken(rawToken)) {
    const principal = await validateOAuthAccessToken(rawToken, config.audience)
    if (!principal) return null
    return {
      credential: { credential: 'oauth', rateLimitIdentity: { userId: principal.user_id } },
      scopes: principal.scopes,
      userId: principal.user_id,
    }
  }
  const { valid, apiKey } = await validateApiKeyForMcpAudience(rawToken, config.audience)
  if (!valid || !apiKey) return null
  return {
    credential: { credential: 'api_key', rateLimitIdentity: { apiKeyId: apiKey.id } },
    scopes: apiKey.permissions,
    userId: apiKey.user_id,
  }
}
