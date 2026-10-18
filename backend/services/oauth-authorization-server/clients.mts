import { OAUTH_CLIENT_COLUMNS } from './client-columns.mts'
import { timingSafeEqual } from 'node:crypto'
import { write, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import {
  OAuthProtocolError,
  registerClient,
  type NewOAuthClient,
  type RegisteredClient,
} from '@vouchington/oauth-server'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { OAUTH_SCOPE_POLICY } from './validation.mts'
import {
  resolveClientIdMetadataDocument,
  type ClientIdMetadataDependencies,
} from './client-id-metadata-document.mts'
import type { OAuthClient } from './types.mts'
import { createProtocolClientLookup } from './protocol-client.mts'

export async function registerOAuthClient(
  input: unknown,
  ownerUserId: string | null = null,
  query: QueryExecutor = write,
): Promise<RegisteredClient> {
  const { registered } = await insertOAuthClient(input, ownerUserId, query)
  return registered
}

/** Validates RFC 7591 metadata and inserts the client, returning its row and one-time secret. */
export async function insertOAuthClient(
  input: unknown,
  ownerUserId: string | null,
  query: QueryExecutor,
): Promise<{
  client: OAuthClient
  clientSecret: string | undefined
  registered: RegisteredClient
}> {
  let insertedClient: OAuthClient | undefined
  const registered = await registerClient(input, {
    scopes: OAUTH_SCOPE_POLICY,
    clientIdPrefix: 'voucha_',
    clientSecretPrefix: 'voucha_secret_',
    defaultAuthMethod: 'none',
    hashSecret: (_purpose, secret) => hashToken(OAUTH_SECRET_PURPOSES.clientSecret, secret),
    registry: {
      findClient: createProtocolClientLookup(getOAuthClient, query),
      createClient: async (client: NewOAuthClient) => {
        insertedClient = await persistRegisteredClient(client, ownerUserId, query)
      },
    },
  })
  if (!insertedClient)
    throw new OAuthProtocolError('server_error', 'client registration failed', 503)
  return { client: insertedClient, clientSecret: registered.client_secret, registered }
}

async function persistRegisteredClient(
  client: NewOAuthClient,
  ownerUserId: string | null,
  query: QueryExecutor,
): Promise<OAuthClient> {
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
     ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::oauth_grant_types[], $8::oauth_response_types[], $9::api_scopes[], $10)
     RETURNING ${OAUTH_CLIENT_COLUMNS}`,
    [
      client.clientId,
      ownerUserId,
      client.clientName,
      client.tokenEndpointAuthMethod === 'none' ? 'public' : 'confidential',
      client.tokenEndpointAuthMethod,
      client.redirectUris,
      client.grantTypes,
      client.responseTypes,
      client.scopes,
      client.clientSecretHash,
    ],
  )
  const persisted = result.rows[0]
  if (!persisted) throw new OAuthProtocolError('server_error', 'client registration failed', 503)
  return persisted
}

export async function getOAuthClient(
  clientId: string,
  query: QueryExecutor = write,
): Promise<OAuthClient | null> {
  const result = await query<OAuthClient>(
    `/* getOAuthClient */ SELECT ${OAUTH_CLIENT_COLUMNS}
     FROM oauth_clients
     WHERE client_id = $1
       AND revoked_at IS NULL
       AND (
         owner_user_id IS NULL
         OR EXISTS (
           SELECT 1 FROM users WHERE users.id = oauth_clients.owner_user_id AND users.deleted_at IS NULL
         )
       )`,
    [clientId],
  )
  return result.rows[0] ?? null
}

export async function getOAuthClientForAuthorization(
  clientId: string,
  clientIdMetadataDependencies: Partial<ClientIdMetadataDependencies> = {},
): Promise<OAuthClient | null> {
  return (
    (await resolveClientIdMetadataDocument(clientId, clientIdMetadataDependencies)) ??
    getOAuthClient(clientId)
  )
}

export async function authenticateOAuthClient(
  clientId: string,
  clientSecret: string | undefined,
): Promise<void> {
  const client = await getOAuthClient(clientId)
  if (!client) throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  assertOAuthClientAuthentication(client, clientSecret)
}

/** Authenticates against a share-locked client row until `query` commits. */
export async function authenticateLockedOAuthClient(
  clientId: string,
  clientSecret: string | undefined,
  query: TransactionQuery,
  activeParticipantIds: ReadonlySet<string>,
): Promise<OAuthClient> {
  const result = await query<OAuthClient>(
    `/* authenticateLockedOAuthClient */ SELECT ${OAUTH_CLIENT_COLUMNS}
     FROM oauth_clients
     WHERE client_id = $1
       AND revoked_at IS NULL
     FOR SHARE`,
    [clientId],
  )
  const client = result.rows[0]
  if (!client) throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  if (client.owner_user_id && !activeParticipantIds.has(client.owner_user_id)) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  assertOAuthClientAuthentication(client, clientSecret)
  return client
}

function assertOAuthClientAuthentication(
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
