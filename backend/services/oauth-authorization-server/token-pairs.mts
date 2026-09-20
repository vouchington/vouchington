import { randomBytes } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { ACCESS_TOKEN_TTL_MS, OAUTH_SECRET_PURPOSES } from './constants.mts'
import type { ApiScope } from '@modules/scopes'
import type { OAuthTokenResponse } from './types.mts'

export async function insertOAuthTokenPair(
  input: {
    familyId: string
    generation: number
    grantId: string
    resource: string
    scopes: ApiScope[]
    refreshExpiresAt: Date
    refreshTokenId?: string
  },
  query: QueryExecutor,
): Promise<OAuthTokenResponse> {
  const accessToken = `voucha_access_${randomBytes(32).toString('base64url')}`
  const refreshToken = `voucha_refresh_${randomBytes(32).toString('base64url')}`
  const now = Date.now()
  const accessExpiresAt = new Date(
    Math.min(now + ACCESS_TOKEN_TTL_MS, input.refreshExpiresAt.getTime()),
  )
  await query(
    `/* insertOAuthTokenPair refresh */ INSERT INTO oauth_refresh_tokens (
       id, family_id, token_hash, scopes, generation, expires_at
     ) VALUES ($1, $2, $3, $4::text[], $5, $6)`,
    [
      input.refreshTokenId ?? uuidv7(),
      input.familyId,
      hashToken(OAUTH_SECRET_PURPOSES.refreshToken, refreshToken),
      input.scopes,
      input.generation,
      input.refreshExpiresAt,
    ],
  )
  await query(
    `/* insertOAuthTokenPair access */ INSERT INTO oauth_access_tokens (
       grant_id, refresh_family_id, token_hash, resource, scopes, expires_at
     ) VALUES ($1, $2, $3, $4, $5::text[], $6)`,
    [
      input.grantId,
      input.familyId,
      hashToken(OAUTH_SECRET_PURPOSES.accessToken, accessToken),
      input.resource,
      input.scopes,
      accessExpiresAt,
    ],
  )
  return {
    access_token: accessToken,
    expires_in: Math.max(0, Math.floor((accessExpiresAt.getTime() - now) / 1000)),
    refresh_token: refreshToken,
    scope: input.scopes.join(' '),
    token_type: 'Bearer',
  }
}
