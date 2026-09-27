import { write } from '@data-stores/psql'
import { buildOAuthAuthorizationResponseUrl } from './redirects.mts'
import { OAuthProtocolError } from './errors.mts'
import type { OAuthClient } from './types.mts'
import {
  resolveClientIdMetadataDocument,
  type ClientIdMetadataDependencies,
} from './client-id-metadata-document.mts'

export async function getOAuthAuthorizationErrorRedirect(
  input: {
    clientId: string
    redirectUri: string
    state: unknown
    error: OAuthProtocolError
  },
  clientIdMetadataDependencies: Partial<ClientIdMetadataDependencies> = {},
): Promise<string | null> {
  const result = await write<OAuthClient>(
    `/* getOAuthClientForAuthorizationErrorRedirect */ SELECT *
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
  let client: OAuthClient | undefined = result.rows[0]
  if (client?.metadata_url && (client.metadata_expires_at?.getTime() ?? 0) <= Date.now()) {
    client = undefined
  }
  if (!client) {
    try {
      client =
        (await resolveClientIdMetadataDocument(input.clientId, clientIdMetadataDependencies)) ??
        undefined
    } catch (error) {
      if (!(error instanceof OAuthProtocolError) || error.code !== 'unauthorized_client')
        throw error
      return null
    }
  }
  if (!client?.redirect_uris.includes(input.redirectUri)) return null
  return buildOAuthAuthorizationResponseUrl(input.redirectUri, {
    error: input.error.code,
    error_description: input.error.message,
    ...(typeof input.state === 'string' && input.state.length <= 1024
      ? { state: input.state }
      : {}),
  })
}
