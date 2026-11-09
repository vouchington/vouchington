import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from '../services/oauth-authorization-server/constants.mts'
import { write } from '@data-stores/psql'

/** Model two requests inserted from overlapping snapshots before either supersession sees the other. */
export async function insertTestOverlappingOAuthRequest(requestId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* insertTestOverlappingOAuthRequest */ INSERT INTO oauth_authorization_requests (
      client_id, user_id, browser_binding_hash, redirect_uri, client_state, resource, scopes, code_challenge, expires_at
    ) SELECT client_id, user_id, browser_binding_hash, redirect_uri, client_state, resource, scopes, code_challenge, expires_at
      FROM oauth_authorization_requests WHERE id = $1 LIMIT 1 RETURNING id`,
    [requestId],
  )
  if (!rows[0]) throw new Error('Owned OAuth request was not found')
  return rows[0].id
}

/** Model a child written after a concurrent revocation snapshot missed that child. */
export async function revokeTestOAuthFamilyWithoutDescendants(
  rawRefreshToken: string,
): Promise<void> {
  await write(
    `/* revokeTestOAuthFamilyWithoutDescendants */ UPDATE oauth_refresh_token_families
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = (SELECT family_id FROM oauth_refresh_tokens WHERE token_hash = $1 LIMIT 1)`,
    [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, rawRefreshToken)],
  )
}
