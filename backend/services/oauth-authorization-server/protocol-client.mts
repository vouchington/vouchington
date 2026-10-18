import type { OAuthClient as ProtocolOAuthClient } from '@vouchington/oauth-server'
import type { OAuthClient } from './types.mts'

/** Projects our persisted client into the published protocol registry contract. */
export function toProtocolOAuthClient(client: OAuthClient | null): ProtocolOAuthClient | null {
  if (!client) return null
  return {
    clientId: client.client_id,
    clientName: client.client_name,
    redirectUris: client.redirect_uris,
    scopes: client.scopes,
    tokenEndpointAuthMethod: client.token_endpoint_auth_method,
    clientSecretHash: client.client_secret_hash,
  }
}
