import { SCOPE_DEFINITIONS, isApiScope } from '@modules/scopes'
import { beginTransaction, write } from '@data-stores/psql'
import { createOAuthBrowserBindingHash } from './browser-binding.mts'
import { AUTHORIZATION_REQUEST_TTL_MS } from './constants.mts'
import { getOAuthClient, getOAuthClientForAuthorization } from './clients.mts'
import { readActiveOAuthParticipantUsers } from './active-users.mts'
import {
  OAuthProtocolError,
  assertClientMayRequestScopes,
  invalidRequest,
  matchesRegisteredRedirectUri,
  validateAuthorizationRequest,
  type AuthorizationParameters,
} from '@vouchington/oauth-server'
import {
  assertOAuthClientMayAuthorizeResource,
  mayUserAuthorizeOAuthResource,
} from './resource-authorization.mts'
import { OAUTH_SCOPE_POLICY } from './validation.mts'
import type {
  OAuthAuthorizationRequestView,
  OAuthClient,
  ValidatedOAuthAuthorizationRequest,
  OAuthAuthorizationRequestRow,
} from './types.mts'
import { getOAuthClientDisplayName } from './known-clients.mts'
import { findOAuthProtectedResource } from './resources.mts'
import { createProtocolClientLookup } from './protocol-client.mts'
import { findNativeOAuthClientDocument } from './native-clients.mts'

export async function beginValidatedOAuthAuthorizationRequest(
  input: { deviceId: string; sessionId: string; userId: string },
  validated: ValidatedOAuthAuthorizationRequest,
): Promise<{ request_id: string }> {
  const { client, codeChallenge, resource, scopes, state } = validated
  await using query = await beginTransaction()
  const activeParticipantIds = await readActiveOAuthParticipantUsers(
    [input.userId, client.owner_user_id],
    query,
  )
  const currentClient = await getOAuthClient(client.client_id, query)
  if (
    !currentClient ||
    !activeParticipantIds.has(input.userId) ||
    (currentClient.owner_user_id && !activeParticipantIds.has(currentClient.owner_user_id))
  ) {
    throw new OAuthProtocolError('access_denied', 'authorization request is unavailable', 403)
  }
  if (!matchesRegisteredRedirectUri(validated.redirectUri, currentClient.redirect_uris)) {
    throw invalidRequest('redirect_uri is not registered for this client')
  }
  assertClientMayRequestScopes(OAUTH_SCOPE_POLICY, currentClient.scopes, scopes)
  assertOAuthClientMayAuthorizeResource(currentClient, resource)
  if (!(await mayUserAuthorizeOAuthResource(input.userId, resource, query))) {
    throw new OAuthProtocolError('access_denied', 'administrator role required', 403)
  }
  const browserBindingHash = createOAuthBrowserBindingHash(input.deviceId, input.sessionId)
  await query(
    `/* beginOAuthAuthorizationRequest supersede */ UPDATE oauth_authorization_requests
     SET denied_at = CURRENT_TIMESTAMP
     WHERE browser_binding_hash = $1
       AND client_id = $2
       AND approved_at IS NULL
       AND denied_at IS NULL`,
    [browserBindingHash, currentClient.id],
  )
  const result = await query<{ id: string }>(
    `/* beginOAuthAuthorizationRequest insert */ INSERT INTO oauth_authorization_requests (
       client_id, user_id, browser_binding_hash, redirect_uri, client_state, resource, scopes,
       code_challenge, expires_at
     ) SELECT $1, $2, $3, $4, $5, $6, $7::api_scopes[], $8, $9
     WHERE EXISTS (SELECT 1 FROM users WHERE id = $2 AND deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = $2 AND lifted_at IS NULL)
       AND EXISTS (SELECT 1 FROM oauth_clients AS client WHERE id = $1 AND revoked_at IS NULL
         AND (owner_user_id IS NULL OR EXISTS (
           SELECT 1 FROM users WHERE id = client.owner_user_id AND deleted_at IS NULL
         )))
     RETURNING id`,
    [
      currentClient.id,
      input.userId,
      browserBindingHash,
      validated.redirectUri,
      state,
      resource,
      scopes,
      codeChallenge,
      new Date(Date.now() + AUTHORIZATION_REQUEST_TTL_MS),
    ],
  )
  await query.commit()
  const row = result.rows[0]
  if (!row)
    throw new OAuthProtocolError('access_denied', 'authorization request is unavailable', 403)
  return { request_id: row.id }
}

export async function validateOAuthAuthorizationRequest(
  input: AuthorizationParameters,
  onClientLoaded?: (client: OAuthClient) => void,
): Promise<ValidatedOAuthAuthorizationRequest> {
  const foundClients: OAuthClient[] = []
  let clientLookup: Promise<OAuthClient | null> | undefined
  const findClient = createProtocolClientLookup(async clientId => {
    const client = await (clientLookup ??= getOAuthClientForAuthorization(clientId))
    if (client && foundClients.length === 0) {
      foundClients.push(client)
      onClientLoaded?.(client)
    }
    return client
  }, undefined)
  // Native callback handling also applies to errors parsed before scope validation reaches
  // client lookup. Share this promise with validation so successful requests still load once.
  if (findNativeOAuthClientDocument(input.clientId)) await findClient(input.clientId)
  const validated = await validateAuthorizationRequest(input, {
    scopes: OAUTH_SCOPE_POLICY,
    resolveResource: findOAuthProtectedResource,
    clients: { findClient },
  })
  const client = foundClients[0]
  if (!client || !validated.scopes.every(isApiScope)) {
    throw new OAuthProtocolError('server_error', 'authorization request validation failed', 503)
  }
  assertOAuthClientMayAuthorizeResource(client, validated.resource)
  return {
    client,
    codeChallenge: validated.codeChallenge,
    redirectUri: validated.redirectUri,
    resource: validated.resource,
    scopes: validated.scopes,
    state: validated.state,
  } as ValidatedOAuthAuthorizationRequest
}

export async function getOAuthAuthorizationRequestForUser(
  userId: string,
  requestId: string,
  browserBindingHash: string,
): Promise<OAuthAuthorizationRequestView | null> {
  const result = await write<OAuthAuthorizationRequestRow>(
    `/* getOAuthAuthorizationRequestForUser */ SELECT
       request.id,
       request.redirect_uri,
       request.resource,
       request.scopes::text[] AS scopes,
       request.expires_at,
       client.client_name,
       client.metadata_url,
       client.redirect_uris
     FROM oauth_authorization_requests AS request
     JOIN oauth_clients AS client ON client.id = request.client_id
     WHERE request.id = $1
       AND request.user_id = $2
       AND request.browser_binding_hash = $3
       AND request.approved_at IS NULL
       AND request.denied_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM oauth_authorization_requests AS newer
         WHERE newer.browser_binding_hash = request.browser_binding_hash
           AND newer.client_id = request.client_id AND newer.id > request.id LIMIT 1
       )
       AND request.expires_at > CURRENT_TIMESTAMP
       AND client.revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM users WHERE users.id = request.user_id AND users.deleted_at IS NULL
       )
       AND (
         client.owner_user_id IS NULL OR EXISTS (
           SELECT 1 FROM users WHERE users.id = client.owner_user_id AND users.deleted_at IS NULL
         )
       )`,
    [requestId, userId, browserBindingHash],
  )
  const row = result.rows[0]
  if (!row || !matchesRegisteredRedirectUri(row.redirect_uri, row.redirect_uris)) return null
  return {
    id: row.id,
    client_name: row.metadata_url ? getOAuthClientDisplayName(row.metadata_url) : row.client_name,
    client_hostname: new URL(row.metadata_url ?? row.redirect_uri).hostname,
    client_is_unverified: row.metadata_url === null,
    resource: row.resource,
    scopes: row.scopes,
    sensitive_scopes: row.scopes.filter(scope => SCOPE_DEFINITIONS[scope].requiresExactGrant),
    expires_at: row.expires_at,
  }
}
