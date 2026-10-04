import { write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from '../../services/oauth-authorization-server/constants.mts'

// Rewrites the scopes stored on one access token, to simulate a token whose carried scopes no
// longer cover a route or tool without going through the consent flow again.
export async function setTestOAuthAccessTokenScopes(
  rawToken: string,
  scopes: readonly string[],
): Promise<void> {
  await write(
    `/* setTestOAuthAccessTokenScopes */ UPDATE oauth_access_tokens
     SET scopes = $2::api_scopes[]
     WHERE token_hash = $1`,
    [hashToken(OAUTH_SECRET_PURPOSES.accessToken, rawToken), scopes],
  )
}
