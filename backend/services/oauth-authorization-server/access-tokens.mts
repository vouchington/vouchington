import { write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import type { ApiScope } from '@modules/scopes'
import type { OAuthAccessPrincipal } from './types.mts'

export async function validateOAuthAccessToken(
  rawToken: string,
  options: { resource?: string; requiredScopes?: ApiScope[] } = {},
): Promise<OAuthAccessPrincipal | null> {
  const result = await write<OAuthAccessPrincipal>(
    `/* validateOAuthAccessToken */ UPDATE oauth_access_tokens AS access
     SET last_used_at = CURRENT_TIMESTAMP
     FROM oauth_grants AS oauth_grant, oauth_clients AS client
     WHERE access.grant_id = oauth_grant.id
       AND oauth_grant.client_id = client.id
       AND access.token_hash = $1
       AND access.revoked_at IS NULL
       AND access.expires_at > CURRENT_TIMESTAMP
       AND oauth_grant.revoked_at IS NULL
       AND client.revoked_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM user_suspensions AS suspension
         WHERE suspension.user_id = oauth_grant.user_id
           AND suspension.lifted_at IS NULL
       )
       AND ($2::text IS NULL OR access.resource = $2)
       AND ($3::text[] IS NULL OR access.scopes @> $3::text[])
     RETURNING client.client_id, oauth_grant.user_id, access.resource, access.scopes, access.expires_at`,
    [
      hashToken(OAUTH_SECRET_PURPOSES.accessToken, rawToken),
      options.resource ?? null,
      options.requiredScopes ?? null,
    ],
  )
  return result.rows[0] ?? null
}
