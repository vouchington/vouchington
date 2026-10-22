import { OAUTH_CLIENT_COLUMNS } from './client-columns.mts'
import { write } from '@data-stores/psql'
import {
  type OAuthProtocolError,
  authorizationErrorRedirect,
  matchesRegisteredRedirectUri,
} from '@vouchington/oauth-server'
import { getOAuthIssuer } from './resources.mts'
import type { OAuthClient } from './types.mts'
import { createProtocolClientLookup } from './protocol-client.mts'

export async function getOAuthAuthorizationErrorRedirect(
  input: {
    clientId: string
    redirectUri: string
    state: unknown
    error: OAuthProtocolError
  },
  eligibleClient: OAuthClient | null,
): Promise<string | null> {
  if (
    !eligibleClient ||
    eligibleClient.client_id !== input.clientId ||
    !matchesRegisteredRedirectUri(input.redirectUri, eligibleClient.redirect_uris)
  )
    return null
  if (
    eligibleClient.metadata_url &&
    (eligibleClient.metadata_expires_at?.getTime() ?? 0) <= Date.now()
  )
    return null
  const result = await write<OAuthClient>(
    `/* getOAuthClientForAuthorizationErrorRedirect */ SELECT ${OAUTH_CLIENT_COLUMNS}
     FROM oauth_clients
     WHERE client_id = $1
       AND revoked_at IS NULL
       AND (
         owner_user_id IS NULL
         OR EXISTS (
           SELECT 1 FROM users WHERE users.id = oauth_clients.owner_user_id AND users.deleted_at IS NULL
         )
       )`,
    [input.clientId],
  )
  const client = result.rows[0]
  if (!client) return null
  if (client.metadata_url && (client.metadata_expires_at?.getTime() ?? 0) <= Date.now()) {
    return null
  }
  return authorizationErrorRedirect(input, {
    issuer: getOAuthIssuer(),
    clients: {
      findClient: createProtocolClientLookup(async () => client ?? null, undefined),
    },
  })
}
