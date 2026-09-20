import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { assertOAuthClientAuthentication, getOAuthClient } from './clients.mts'
import { OAuthProtocolError } from './errors.mts'
import { revokeOAuthRefreshFamily } from './refresh-family.mts'
import { insertOAuthTokenPair } from './token-pairs.mts'
import { assertScopeSubset, parseOAuthScopes } from './validation.mts'
import type { ApiScope } from '@modules/scopes'
import type { OAuthClient, OAuthTokenResponse } from './types.mts'

type RefreshTokenRow = {
  id: string
  family_id: string
  grant_id: string
  client_internal_id: string
  resource: string
  scopes: ApiScope[]
  generation: number
  token_expires_at: Date
  family_expires_at: Date
  consumed_at: Date | null
  token_revoked_at: Date | null
  family_revoked_at: Date | null
  grant_revoked_at: Date | null
}

export async function exchangeOAuthRefreshToken(input: {
  clientId: string
  clientSecret?: string
  refreshToken: string
  scope?: string
}): Promise<OAuthTokenResponse> {
  await using query = await beginTransaction()
  const client = await getOAuthClient(input.clientId, query)
  if (!client) throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  assertOAuthClientAuthentication(client, input.clientSecret)
  const token = await lockRefreshToken(input.refreshToken, query)
  if (!token) throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  assertRefreshClient(token, client)

  if (token.consumed_at) {
    await revokeOAuthRefreshFamily(token.family_id, query, true)
    await query.commit()
    throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  }
  assertRefreshTokenActive(token)
  const scopes = input.scope === undefined ? token.scopes : parseOAuthScopes(input.scope)
  assertScopeSubset(scopes, token.scopes)
  const tokens = await rotateRefreshToken(token, scopes, query)
  await query(
    `/* exchangeOAuthRefreshToken grant */ UPDATE oauth_grants
     SET last_used_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [token.grant_id],
  )
  await query.commit()
  return tokens
}

async function lockRefreshToken(
  rawToken: string,
  query: TransactionQuery,
): Promise<RefreshTokenRow | null> {
  const result = await query<RefreshTokenRow>(
    `/* lockRefreshToken */ SELECT
       refresh.id,
       refresh.family_id,
       family.grant_id,
       oauth_grant.client_id AS client_internal_id,
       family.resource,
       refresh.scopes,
       refresh.generation,
       refresh.expires_at AS token_expires_at,
       family.expires_at AS family_expires_at,
       refresh.consumed_at,
       refresh.revoked_at AS token_revoked_at,
       family.revoked_at AS family_revoked_at,
       oauth_grant.revoked_at AS grant_revoked_at
     FROM oauth_refresh_tokens AS refresh
     JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = family.grant_id
     WHERE refresh.token_hash = $1
       AND NOT EXISTS (
         SELECT 1
         FROM user_suspensions AS suspension
         WHERE suspension.user_id = oauth_grant.user_id
           AND suspension.lifted_at IS NULL
       )
     FOR UPDATE OF refresh, family, oauth_grant`,
    [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, rawToken)],
  )
  return result.rows[0] ?? null
}

function assertRefreshClient(token: RefreshTokenRow, client: OAuthClient): void {
  if (token.client_internal_id !== client.id) {
    throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  }
}

function assertRefreshTokenActive(token: RefreshTokenRow): void {
  const now = new Date()
  if (
    token.token_revoked_at ||
    token.family_revoked_at ||
    token.grant_revoked_at ||
    token.token_expires_at <= now ||
    token.family_expires_at <= now
  ) {
    throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  }
}

async function rotateRefreshToken(
  token: RefreshTokenRow,
  scopes: ApiScope[],
  query: TransactionQuery,
): Promise<OAuthTokenResponse> {
  const replacementId = uuidv7()
  const tokens = await insertOAuthTokenPair(
    {
      familyId: token.family_id,
      generation: token.generation + 1,
      grantId: token.grant_id,
      resource: token.resource,
      scopes,
      refreshExpiresAt: token.family_expires_at,
      refreshTokenId: replacementId,
    },
    query,
  )
  await query(
    `/* rotateRefreshToken */ UPDATE oauth_refresh_tokens
     SET consumed_at = CURRENT_TIMESTAMP,
         replaced_by_id = $2
     WHERE id = $1`,
    [token.id, replacementId],
  )
  return tokens
}
