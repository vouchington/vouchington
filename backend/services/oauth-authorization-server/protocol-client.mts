import type { OAuthClient as ProtocolOAuthClient } from '@vouchington/oauth-server'
import type { OAuthClient } from './types.mts'

/** Projects our persisted client into the published protocol registry contract. */
function toProtocolOAuthClient(client: OAuthClient | null): ProtocolOAuthClient | null {
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

/** Uses the same product-client projection for registration and authorization lookups. */
export function createProtocolClientLookup<Context>(
  findClient: (clientId: string, context: Context) => Promise<OAuthClient | null>,
  context: Context,
): (clientId: string) => Promise<ProtocolOAuthClient | null> {
  return async clientId => toProtocolOAuthClient(await findClient(clientId, context))
}
