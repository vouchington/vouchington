import { createHash, timingSafeEqual } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { OAUTH_SECRET_PURPOSES, REFRESH_TOKEN_TTL_MS } from './constants.mts'
import { assertOAuthClientAuthentication, getOAuthClient } from './clients.mts'
import { OAuthProtocolError } from './errors.mts'
import { insertOAuthTokenPair } from './token-pairs.mts'
import { assertTokenRequestResource, validatePkceVerifier } from './validation.mts'
import type { ApiScope } from '@modules/scopes'
import type { OAuthClient, OAuthTokenResponse } from './types.mts'

type AuthorizationCodeRow = {
  id: string
  grant_id: string
  client_internal_id: string
  redirect_uri: string
  resource: string
  scopes: ApiScope[]
  code_challenge: string
  expires_at: Date
  consumed_at: Date | null
  grant_revoked_at: Date | null
}

export async function exchangeOAuthAuthorizationCode(input: {
  clientId: string
  clientSecret?: string
  code: string
  codeVerifier: unknown
  redirectUri: string
  resource?: string
}): Promise<OAuthTokenResponse> {
  await using query = await beginTransaction()
  const client = await getOAuthClient(input.clientId, query)
  if (!client) throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  assertOAuthClientAuthentication(client, input.clientSecret)
  const verifier = validatePkceVerifier(input.codeVerifier)
  const code = await lockAuthorizationCode(input.code, query)
  if (!code) throw new OAuthProtocolError('invalid_grant', 'authorization code is invalid')
  assertCodeExchange(code, client, input, verifier)
  assertTokenRequestResource(input.resource, code.resource)

  const tokens = await completeAuthorizationCodeExchange(code, query)
  await query.commit()
  return tokens
}

async function completeAuthorizationCodeExchange(
  code: AuthorizationCodeRow,
  query: TransactionQuery,
): Promise<OAuthTokenResponse> {
  const tokens = await issueNewTokenFamily(code, query)
  await markAuthorizationCodeConsumed(code, query)
  return tokens
}

async function markAuthorizationCodeConsumed(
  code: AuthorizationCodeRow,
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* markAuthorizationCodeConsumed */ UPDATE oauth_authorization_codes
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [code.id],
  )
  await query(
    `/* markAuthorizationCodeConsumed grant */ UPDATE oauth_grants
     SET last_used_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [code.grant_id],
  )
}

async function lockAuthorizationCode(
  rawCode: string,
  query: TransactionQuery,
): Promise<AuthorizationCodeRow | null> {
  const result = await query<AuthorizationCodeRow>(
    `/* lockAuthorizationCode */ SELECT
       code.id,
       code.grant_id,
       oauth_grant.client_id AS client_internal_id,
       code.redirect_uri,
       code.resource,
       code.scopes,
       code.code_challenge,
       code.expires_at,
       code.consumed_at,
       oauth_grant.revoked_at AS grant_revoked_at
     FROM oauth_authorization_codes AS code
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = code.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE code.code_hash = $1
       AND client.revoked_at IS NULL
       AND code.redirect_uri = ANY(client.redirect_uris)
       AND NOT EXISTS (
         SELECT 1
         FROM user_suspensions AS suspension
         WHERE suspension.user_id = oauth_grant.user_id
           AND suspension.lifted_at IS NULL
       )
     FOR UPDATE OF code, oauth_grant FOR SHARE OF client`,
    [hashToken(OAUTH_SECRET_PURPOSES.authorizationCode, rawCode)],
  )
  return result.rows[0] ?? null
}

function assertCodeExchange(
  code: AuthorizationCodeRow,
  client: OAuthClient,
  input: { clientSecret?: string; redirectUri: string },
  verifier: string,
): void {
  if (
    code.client_internal_id !== client.id ||
    code.consumed_at ||
    code.grant_revoked_at ||
    code.expires_at <= new Date() ||
    code.redirect_uri !== input.redirectUri ||
    !pkceMatches(code.code_challenge, verifier)
  ) {
    throw new OAuthProtocolError('invalid_grant', 'authorization code is invalid')
  }
}

function pkceMatches(expectedChallenge: string, verifier: string): boolean {
  const actual = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const expected = Buffer.from(expectedChallenge)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function issueNewTokenFamily(
  code: AuthorizationCodeRow,
  query: TransactionQuery,
): Promise<OAuthTokenResponse> {
  const familyId = uuidv7()
  const familyExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  await query(
    `/* issueNewTokenFamily */ INSERT INTO oauth_refresh_token_families (
       id, grant_id, resource, scopes, expires_at
     ) VALUES ($1, $2, $3, $4::text[], $5)`,
    [familyId, code.grant_id, code.resource, code.scopes, familyExpiresAt],
  )
  return insertOAuthTokenPair(
    {
      familyId,
      generation: 0,
      grantId: code.grant_id,
      resource: code.resource,
      scopes: code.scopes,
      refreshExpiresAt: familyExpiresAt,
    },
    query,
  )
}
