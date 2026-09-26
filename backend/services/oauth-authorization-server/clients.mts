import { randomBytes, timingSafeEqual } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import { hasEveryScope } from '@modules/scopes'
import { hashToken } from '@modules/token-secrets'
import { OAuthProtocolError, invalidClientMetadata, invalidRequest } from './errors.mts'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import {
  validateAuthMethod,
  validateClientName,
  validateGrantTypes,
  validateRegistrationObject,
  validateResponseTypes,
} from './client-metadata-validation.mts'
import { validateRedirectUris } from './redirect-uri-validation.mts'
import { parseOAuthScopes } from './validation.mts'
import type { OAuthClient, RegisteredOAuthClient } from './types.mts'

export async function registerOAuthClient(
  input: unknown,
  ownerUserId: string | null = null,
  query: QueryExecutor = write,
): Promise<RegisteredOAuthClient> {
  const { client, clientSecret } = await insertOAuthClient(input, ownerUserId, query)
  return {
    client_id: client.client_id,
    client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
    client_name: client.client_name,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 as const } : {}),
    grant_types: client.grant_types,
    redirect_uris: client.redirect_uris,
    response_types: client.response_types,
    scope: client.scopes.join(' '),
    token_endpoint_auth_method: client.token_endpoint_auth_method,
  }
}

/** Validates RFC 7591 metadata and inserts the client, returning its row and one-time secret. */
export async function insertOAuthClient(
  input: unknown,
  ownerUserId: string | null,
  query: QueryExecutor,
): Promise<{ client: OAuthClient; clientSecret: string | undefined }> {
  const metadata = validateRegistrationObject(input)
  const clientName = validateClientName(metadata.client_name)
  const redirectUris = validateRedirectUris(metadata.redirect_uris)
  const tokenEndpointAuthMethod = validateAuthMethod(metadata.token_endpoint_auth_method)
  const grantTypes = validateGrantTypes(metadata.grant_types)
  const responseTypes = validateResponseTypes(metadata.response_types)
  let scopes: OAuthClient['scopes']
  try {
    scopes = parseOAuthScopes(metadata.scope)
  } catch (error) {
    if (error instanceof OAuthProtocolError) throw invalidClientMetadata(error.message)
    throw error
  }
  const clientId = `voucha_${randomBytes(24).toString('base64url')}`
  const clientSecret =
    tokenEndpointAuthMethod === 'client_secret_basic' ? generateOAuthClientSecret() : undefined

  const result = await query<OAuthClient>(
    `/* registerOAuthClient */ INSERT INTO oauth_clients (
       client_id,
       owner_user_id,
       client_name,
       client_type,
       token_endpoint_auth_method,
       redirect_uris,
       grant_types,
       response_types,
       scopes,
       client_secret_hash
     ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8::text[], $9::text[], $10)
     RETURNING *`,
    [
      clientId,
      ownerUserId,
      clientName,
      tokenEndpointAuthMethod === 'none' ? 'public' : 'confidential',
      tokenEndpointAuthMethod,
      redirectUris,
      grantTypes,
      responseTypes,
      scopes,
      clientSecret ? hashToken(OAUTH_SECRET_PURPOSES.clientSecret, clientSecret) : null,
    ],
  )
  const client = result.rows[0]
  if (!client) throw new OAuthProtocolError('server_error', 'client registration failed', 503)
  return { client, clientSecret }
}

export async function getOAuthClient(
  clientId: string,
  query: QueryExecutor = write,
): Promise<OAuthClient | null> {
  const result = await query<OAuthClient>(
    `/* getOAuthClient */ SELECT *
     FROM oauth_clients
     WHERE client_id = $1
       AND revoked_at IS NULL`,
    [clientId],
  )
  return result.rows[0] ?? null
}

export async function authenticateOAuthClient(
  clientId: string,
  clientSecret: string | undefined,
): Promise<void> {
  const client = await getOAuthClient(clientId)
  if (!client) throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  assertOAuthClientAuthentication(client, clientSecret)
}

export function assertOAuthClientAuthentication(
  client: OAuthClient,
  clientSecret: string | undefined,
): void {
  if (client.token_endpoint_auth_method === 'none') {
    if (clientSecret !== undefined)
      throw new OAuthProtocolError('invalid_client', 'public client sent a secret', 401)
    return
  }
  if (!clientSecret || !client.client_secret_hash) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  const actual = Buffer.from(hashToken(OAUTH_SECRET_PURPOSES.clientSecret, clientSecret), 'hex')
  const expected = Buffer.from(client.client_secret_hash, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
}

export function assertClientAuthorizationRequest(
  client: OAuthClient,
  redirectUri: string,
  scopes: OAuthClient['scopes'],
): void {
  if (!client.redirect_uris.includes(redirectUri)) {
    throw invalidRequest('redirect_uri is not registered for this client')
  }
  // Uses the same coverage rule as tool authorization, so a client registered with
  // `mcp.user:write` may request `cards:write`.
  if (!hasEveryScope(client.scopes, scopes)) {
    throw new OAuthProtocolError(
      'invalid_scope',
      'requested scope is not registered for this client',
    )
  }
}

export function generateOAuthClientSecret(): string {
  return `voucha_secret_${randomBytes(32).toString('base64url')}`
}
