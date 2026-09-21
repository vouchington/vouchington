import { read, write } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from '../../services/oauth-authorization-server/constants.mts'

export async function getTestOAuthClientStorage(clientId: string): Promise<{
  client_secret_hash: string | null
} | null> {
  const result = await read<{
    client_secret_hash: string | null
  }>(
    `/* getTestOAuthClientStorage */ SELECT client_secret_hash
     FROM oauth_clients
     WHERE client_id = $1`,
    [clientId],
  )
  return result.rows[0] ?? null
}

export async function getTestOAuthCredentialStorage(input: {
  accessToken?: string
  authorizationCode?: string
  refreshToken?: string
}): Promise<{
  accessTokenStored: boolean
  authorizationCodeConsumed: boolean | null
  refreshTokenConsumed: boolean | null
  refreshFamilyRevoked: boolean | null
  refreshReuseDetected: boolean | null
}> {
  const codeResult = input.authorizationCode
    ? await read<{ consumed: boolean }>(
        `/* getTestOAuthCredentialStorage code */ SELECT consumed_at IS NOT NULL AS consumed
         FROM oauth_authorization_codes
         WHERE code_hash = $1`,
        [hashToken(OAUTH_SECRET_PURPOSES.authorizationCode, input.authorizationCode)],
      )
    : { rows: [] }
  const accessResult = input.accessToken
    ? await read<{ present: boolean }>(
        `/* getTestOAuthCredentialStorage access */ SELECT TRUE AS present
         FROM oauth_access_tokens
         WHERE token_hash = $1`,
        [hashToken(OAUTH_SECRET_PURPOSES.accessToken, input.accessToken)],
      )
    : { rows: [] }
  const refreshResult = input.refreshToken
    ? await read<{
        consumed: boolean
        family_revoked: boolean
        reuse_detected: boolean
      }>(
        `/* getTestOAuthCredentialStorage refresh */ SELECT
           refresh.consumed_at IS NOT NULL AS consumed,
           family.revoked_at IS NOT NULL AS family_revoked,
           family.reuse_detected_at IS NOT NULL AS reuse_detected
         FROM oauth_refresh_tokens AS refresh
         JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
         WHERE refresh.token_hash = $1`,
        [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, input.refreshToken)],
      )
    : { rows: [] }
  return {
    accessTokenStored: accessResult.rows[0]?.present ?? false,
    authorizationCodeConsumed: codeResult.rows[0]?.consumed ?? null,
    refreshTokenConsumed: refreshResult.rows[0]?.consumed ?? null,
    refreshFamilyRevoked: refreshResult.rows[0]?.family_revoked ?? null,
    refreshReuseDetected: refreshResult.rows[0]?.reuse_detected ?? null,
  }
}

export async function getTestOAuthTokenRevocationState(input: {
  accessToken?: string
  refreshToken?: string
}): Promise<{
  accessTokenRevoked: boolean | null
  refreshTokenRevoked: boolean | null
  refreshFamilyRevoked: boolean | null
}> {
  const accessResult = input.accessToken
    ? await read<{ revoked: boolean }>(
        `/* getTestOAuthTokenRevocationState access */ SELECT revoked_at IS NOT NULL AS revoked
         FROM oauth_access_tokens
         WHERE token_hash = $1`,
        [hashToken(OAUTH_SECRET_PURPOSES.accessToken, input.accessToken)],
      )
    : { rows: [] }
  const refreshResult = input.refreshToken
    ? await read<{ family_revoked: boolean; revoked: boolean }>(
        `/* getTestOAuthTokenRevocationState refresh */ SELECT
           refresh.revoked_at IS NOT NULL AS revoked,
           family.revoked_at IS NOT NULL AS family_revoked
         FROM oauth_refresh_tokens AS refresh
         JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
         WHERE refresh.token_hash = $1`,
        [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, input.refreshToken)],
      )
    : { rows: [] }
  return {
    accessTokenRevoked: accessResult.rows[0]?.revoked ?? null,
    refreshTokenRevoked: refreshResult.rows[0]?.revoked ?? null,
    refreshFamilyRevoked: refreshResult.rows[0]?.family_revoked ?? null,
  }
}

export async function expireTestOAuthAuthorizationCode(rawCode: string): Promise<void> {
  await write(
    `/* expireTestOAuthAuthorizationCode */ UPDATE oauth_authorization_codes
     SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
     WHERE code_hash = $1`,
    [hashToken(OAUTH_SECRET_PURPOSES.authorizationCode, rawCode)],
  )
}

export async function setTestOAuthArtifactExpiry(clientId: string, expiresAt: Date): Promise<void> {
  await write(
    `/* setTestOAuthArtifactExpiry */ WITH target_client AS (
       SELECT id FROM oauth_clients WHERE client_id = $1
     ), expired_requests AS (
       UPDATE oauth_authorization_requests
       SET expires_at = $2
       WHERE client_id IN (SELECT id FROM target_client)
     ), expired_codes AS (
       UPDATE oauth_authorization_codes
       SET expires_at = $2
       WHERE grant_id IN (
         SELECT id FROM oauth_grants WHERE client_id IN (SELECT id FROM target_client)
       )
     ), expired_access AS (
       UPDATE oauth_access_tokens
       SET expires_at = $2
       WHERE grant_id IN (
         SELECT id FROM oauth_grants WHERE client_id IN (SELECT id FROM target_client)
       )
     )
     UPDATE oauth_refresh_token_families
     SET expires_at = $2
     WHERE grant_id IN (
       SELECT id FROM oauth_grants WHERE client_id IN (SELECT id FROM target_client)
     )`,
    [clientId, expiresAt],
  )
}

export async function expireTestOAuthRefreshToken(rawToken: string): Promise<void> {
  await write(
    `/* expireTestOAuthRefreshToken */ UPDATE oauth_refresh_tokens
     SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
     WHERE token_hash = $1`,
    [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, rawToken)],
  )
}

export async function setTestOAuthRefreshFamilyExpiry(
  rawToken: string,
  expiresAt: Date,
): Promise<void> {
  await write(
    `/* setTestOAuthRefreshFamilyExpiry */ UPDATE oauth_refresh_token_families
     SET expires_at = $2
     WHERE id = (
       SELECT family_id FROM oauth_refresh_tokens WHERE token_hash = $1
     )`,
    [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, rawToken), expiresAt],
  )
}

export async function revokeTestOAuthGrant(clientId: string): Promise<void> {
  await write(
    `/* revokeTestOAuthGrant */ UPDATE oauth_grants
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE client_id = (SELECT id FROM oauth_clients WHERE client_id = $1)`,
    [clientId],
  )
}

export async function clientSecretMatchesStoredHash(
  clientId: string,
  rawSecret: string,
): Promise<boolean> {
  const stored = await getTestOAuthClientStorage(clientId)
  return stored?.client_secret_hash === hashToken(OAUTH_SECRET_PURPOSES.clientSecret, rawSecret)
}
