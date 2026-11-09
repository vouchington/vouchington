import { write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from '../../services/oauth-authorization-server/constants.mts'

export async function expireTestOAuthAccessToken(rawToken: string): Promise<void> {
  await write(
    `/* expireTestOAuthAccessToken */ UPDATE oauth_access_tokens
     SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
     WHERE token_hash = $1`,
    [hashToken(OAUTH_SECRET_PURPOSES.accessToken, rawToken)],
  )
}
