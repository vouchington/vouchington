import { beginTransaction, write } from '@data-stores/psql'
import { createOAuthBrowserBindingHash } from './browser-binding.mts'
import { AUTHORIZATION_REQUEST_TTL_MS } from './constants.mts'
import {
  assertClientAuthorizationRequest,
  getOAuthClient,
  getOAuthClientForAuthorization,
} from './clients.mts'
import { lockOAuthParticipantUsers } from './active-users.mts'
import { OAuthProtocolError, invalidRequest } from './errors.mts'
import { mayUserAuthorizeOAuthResource } from './resource-authorization.mts'
import {
  assertScopesMatchResource,
  parseOAuthScopes,
  validatePkceChallenge,
  validateResource,
} from './validation.mts'
import type {
  OAuthAuthorizationRequestView,
  OAuthClient,
  ValidatedOAuthAuthorizationRequest,
} from './types.mts'
import { getOAuthClientDisplayName } from './known-clients.mts'
import type { ClientIdMetadataDependencies } from './client-id-metadata-document.mts'

type OAuthAuthorizationRequestParameters = {
  clientId: string
  codeChallenge: unknown
  codeChallengeMethod: unknown
  redirectUri: string
  resource: unknown
  responseType: unknown
  scope: unknown
  state: unknown
}

type AuthorizationRequestRow = {
  id: string
  client_id: string
  user_id: string
  redirect_uri: string
  state: string
  resource: string
  scopes: OAuthClient['scopes']
  code_challenge: string
  expires_at: Date
  approved_at: Date | null
  denied_at: Date | null
  client_name: string
  metadata_url: string | null
}

export async function beginOAuthAuthorizationRequest(
  input: {
    deviceId: string
    sessionId: string
    userId: string
  } & OAuthAuthorizationRequestParameters,
  clientIdMetadataDependencies: Partial<ClientIdMetadataDependencies> = {},
): Promise<{ request_id: string }> {
  const validated = await validateOAuthAuthorizationRequest(input, clientIdMetadataDependencies)
  return beginValidatedOAuthAuthorizationRequest(input, validated)
}

export async function beginValidatedOAuthAuthorizationRequest(
  input: { deviceId: string; sessionId: string; userId: string },
  validated: ValidatedOAuthAuthorizationRequest,
): Promise<{ request_id: string }> {
  const { client, codeChallenge, resource, scopes, state } = validated
  await using query = await beginTransaction()
  const activeParticipantIds = await lockOAuthParticipantUsers(
    [input.userId, client.owner_user_id],
    query,
  )
  const lockedClient = await getOAuthClient(client.client_id, query)
  if (
    !lockedClient ||
    !activeParticipantIds.has(input.userId) ||
    (lockedClient.owner_user_id && !activeParticipantIds.has(lockedClient.owner_user_id))
  ) {
    throw new OAuthProtocolError('access_denied', 'authorization request is unavailable', 403)
  }
  assertClientAuthorizationRequest(lockedClient, validated.redirectUri, scopes)
  if (!(await mayUserAuthorizeOAuthResource(input.userId, resource, query))) {
    throw new OAuthProtocolError('access_denied', 'administrator role required', 403)
  }
  const browserBindingHash = createOAuthBrowserBindingHash(input.deviceId, input.sessionId)
  await query(
    `/* beginOAuthAuthorizationRequest lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`oauth-authorization-request:${browserBindingHash}:${lockedClient.id}`],
  )
  await query(
    `/* beginOAuthAuthorizationRequest supersede */ UPDATE oauth_authorization_requests
     SET denied_at = CURRENT_TIMESTAMP
     WHERE browser_binding_hash = $1
       AND client_id = $2
       AND approved_at IS NULL
       AND denied_at IS NULL`,
    [browserBindingHash, lockedClient.id],
  )
  const result = await query<{ id: string }>(
    `/* beginOAuthAuthorizationRequest insert */ INSERT INTO oauth_authorization_requests (
       client_id, user_id, browser_binding_hash, redirect_uri, state, resource, scopes,
       code_challenge, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9)
     RETURNING id`,
    [
      lockedClient.id,
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
    throw new OAuthProtocolError('server_error', 'authorization request was not created', 503)
  return { request_id: row.id }
}

export async function validateOAuthAuthorizationRequest(
  input: OAuthAuthorizationRequestParameters,
  clientIdMetadataDependencies: Partial<ClientIdMetadataDependencies> = {},
): Promise<ValidatedOAuthAuthorizationRequest> {
  if (input.responseType !== 'code') {
    throw new OAuthProtocolError('unsupported_response_type', 'response_type must be code')
  }
  if (typeof input.state !== 'string' || input.state.length === 0 || input.state.length > 1024) {
    throw invalidRequest('state is required')
  }
  const scopes = parseOAuthScopes(input.scope)
  const resource = validateResource(input.resource)
  assertScopesMatchResource(scopes, resource)
  const codeChallenge = validatePkceChallenge(input.codeChallenge, input.codeChallengeMethod)
  const client = await getOAuthClientForAuthorization(input.clientId, clientIdMetadataDependencies)
  if (!client) throw new OAuthProtocolError('unauthorized_client', 'client is not registered')
  assertClientAuthorizationRequest(client, input.redirectUri, scopes)
  return {
    client,
    codeChallenge,
    redirectUri: input.redirectUri,
    resource: resource.url,
    scopes,
    state: input.state,
  } as ValidatedOAuthAuthorizationRequest
}

export async function getOAuthAuthorizationRequestForUser(
  userId: string,
  requestId: string,
  browserBindingHash: string,
): Promise<OAuthAuthorizationRequestView | null> {
  const result = await write<AuthorizationRequestRow>(
    `/* getOAuthAuthorizationRequestForUser */ SELECT
       request.id,
       request.resource,
       request.scopes,
       request.expires_at,
       client.client_name,
       client.metadata_url
     FROM oauth_authorization_requests AS request
     JOIN oauth_clients AS client ON client.id = request.client_id
     WHERE request.id = $1
       AND request.user_id = $2
       AND request.browser_binding_hash = $3
       AND request.approved_at IS NULL
       AND request.denied_at IS NULL
       AND request.expires_at > CURRENT_TIMESTAMP
       AND client.revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM users WHERE users.id = request.user_id AND users.deleted_at IS NULL
       )
       AND (
         client.owner_user_id IS NULL OR EXISTS (
           SELECT 1 FROM users WHERE users.id = client.owner_user_id AND users.deleted_at IS NULL
         )
       )
       AND request.redirect_uri = ANY(client.redirect_uris)`,
    [requestId, userId, browserBindingHash],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    client_name: row.metadata_url ? getOAuthClientDisplayName(row.metadata_url) : row.client_name,
    client_hostname: row.metadata_url ? new URL(row.metadata_url).hostname : null,
    resource: row.resource,
    scopes: row.scopes,
    expires_at: row.expires_at,
  }
}
