import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { authenticateOAuthRefreshClient } from './refresh-client-authority.mts'
import {
  assertTokenRequestResource,
  OAuthProtocolError,
  type TokenResponse,
} from '@vouchington/oauth-server'
import { revokeOAuthRefreshFamily } from './refresh-family.mts'
import { insertOAuthTokenPair } from './token-pairs.mts'
import { assertScopeSubset, parseOAuthScopes } from './validation.mts'
import type { ApiScope } from '@modules/scopes'
import type { OAuthClient } from './types.mts'

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
  user_id: string
  owner_user_id: string | null
}

export async function exchangeOAuthRefreshToken(input: {
  clientId: string
  clientSecret?: string
  refreshToken: string
  resource?: string
  scope?: string
}): Promise<TokenResponse> {
  await using query = await beginTransaction()
  const { activeParticipantIds, client } = await authenticateOAuthRefreshClient(input, query)
  const token = await lockRefreshToken(input.refreshToken, query)
  if (!token) throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  if (
    !activeParticipantIds.has(token.user_id) ||
    (token.owner_user_id && !activeParticipantIds.has(token.owner_user_id))
  ) {
    throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  }
  assertRefreshClient(token, client)

  if (token.consumed_at) {
    await revokeOAuthRefreshFamily(token.family_id, query, true)
    await query.commit()
    throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  }
  assertRefreshTokenActive(token)
  assertTokenRequestResource(input.resource, token.resource)
  const scopes = input.scope === undefined ? token.scopes : parseOAuthScopes(input.scope)
  assertScopeSubset(scopes, token.scopes)
  const grant = await query(
    `/* exchangeOAuthRefreshToken grant */ UPDATE oauth_grants AS oauth_grant
     SET last_used_at = CURRENT_TIMESTAMP
     WHERE oauth_grant.id = $1 AND oauth_grant.revoked_at IS NULL
       AND EXISTS (SELECT 1 FROM users WHERE id = oauth_grant.user_id AND deleted_at IS NULL)
       AND EXISTS (
         SELECT 1 FROM oauth_clients AS client
         WHERE client.id = oauth_grant.client_id AND client.revoked_at IS NULL
           AND (client.owner_user_id IS NULL OR EXISTS (
             SELECT 1 FROM users WHERE id = client.owner_user_id AND deleted_at IS NULL
           ))
       )
     RETURNING oauth_grant.id`,
    [token.grant_id],
  )
  if (!grant.rows[0]) throw new OAuthProtocolError('invalid_grant', 'refresh token is invalid')
  const tokens = await rotateRefreshToken(token, scopes, query)
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
       refresh.scopes::text[] AS scopes,
       refresh.generation,
       refresh.expires_at AS token_expires_at,
       family.expires_at AS family_expires_at,
       refresh.consumed_at,
       refresh.revoked_at AS token_revoked_at,
       family.revoked_at AS family_revoked_at,
       oauth_grant.revoked_at AS grant_revoked_at,
       oauth_grant.user_id,
       client.owner_user_id
     FROM oauth_refresh_tokens AS refresh
     JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = family.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE refresh.token_hash = $1
       AND client.revoked_at IS NULL
       AND EXISTS (SELECT 1 FROM users WHERE id = oauth_grant.user_id AND deleted_at IS NULL)
       AND (client.owner_user_id IS NULL OR EXISTS (
         SELECT 1 FROM users WHERE id = client.owner_user_id AND deleted_at IS NULL
       ))
     FOR UPDATE OF refresh`,
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
): Promise<TokenResponse> {
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
         replaced_by_token_id = $2
     WHERE id = $1`,
    [token.id, replacementId],
  )
  return tokens
}
