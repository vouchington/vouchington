import { write } from '@data-stores/psql'
import { buildOAuthAuthorizationResponseUrl } from './redirects.mts'
import type { OAuthProtocolError } from './errors.mts'
import type { OAuthClient } from './types.mts'

export async function getOAuthAuthorizationErrorRedirect(input: {
  clientId: string
  redirectUri: string
  state: unknown
  error: OAuthProtocolError
}): Promise<string | null> {
  const result = await write<OAuthClient>(
    `/* getFreshOAuthClientForAuthorizationErrorRedirect */ SELECT *
     FROM oauth_clients
     WHERE client_id = $1
       AND revoked_at IS NULL
       AND (metadata_url IS NULL OR metadata_expires_at > CURRENT_TIMESTAMP)
       AND (
         owner_user_id IS NULL
         OR EXISTS (
           SELECT 1 FROM users WHERE users.id = oauth_clients.owner_user_id AND users.deleted_at IS NULL
         )
       )`,
    [input.clientId],
  )
  const client = result.rows[0]
  if (!client?.redirect_uris.includes(input.redirectUri)) return null
  return buildOAuthAuthorizationResponseUrl(input.redirectUri, {
    error: input.error.code,
    error_description: input.error.message,
    ...(typeof input.state === 'string' && input.state.length <= 1024
      ? { state: input.state }
      : {}),
  })
}
