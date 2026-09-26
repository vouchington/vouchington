import { beginTransaction, write } from '@data-stores/psql'
import { createOAuthBrowserBindingHash } from './browser-binding.mts'
import { AUTHORIZATION_REQUEST_TTL_MS } from './constants.mts'
import { assertClientAuthorizationRequest, getOAuthClient } from './clients.mts'
import { OAuthProtocolError, invalidRequest } from './errors.mts'
import { buildOAuthAuthorizationResponseUrl } from './redirects.mts'
import { mayUserAuthorizeOAuthResource } from './resource-authorization.mts'
import {
  assertScopesMatchResource,
  parseOAuthScopes,
  validatePkceChallenge,
  validateResource,
} from './validation.mts'
import type { ApiScope } from '@modules/scopes'
import type { OAuthAuthorizationRequestView, OAuthClient } from './types.mts'

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

type ValidatedOAuthAuthorizationRequest = {
  client: OAuthClient
  codeChallenge: string
  resource: string
  scopes: ApiScope[]
  state: string
}

type AuthorizationRequestRow = {
  id: string
  client_id: string
  user_id: string
  redirect_uri: string
  state: string
  resource: string
  scopes: ApiScope[]
  code_challenge: string
  expires_at: Date
  approved_at: Date | null
  denied_at: Date | null
  client_name: string
}

export async function beginOAuthAuthorizationRequest(
  input: {
    deviceId: string
    sessionId: string
    userId: string
  } & OAuthAuthorizationRequestParameters,
): Promise<{ request_id: string }> {
  const validated = await validateOAuthAuthorizationRequest(input)
  const { client, codeChallenge, resource, scopes, state } = validated
  if (!(await mayUserAuthorizeOAuthResource(input.userId, resource))) {
    throw new OAuthProtocolError('access_denied', 'administrator role required', 403)
  }

  await using query = await beginTransaction()
  const browserBindingHash = createOAuthBrowserBindingHash(input.deviceId, input.sessionId)
  await query(
    `/* beginOAuthAuthorizationRequest lock */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`oauth-authorization-request:${browserBindingHash}:${client.id}`],
  )
  await query(
    `/* beginOAuthAuthorizationRequest supersede */ UPDATE oauth_authorization_requests
     SET denied_at = CURRENT_TIMESTAMP
     WHERE browser_binding_hash = $1
       AND client_id = $2
       AND approved_at IS NULL
       AND denied_at IS NULL`,
    [browserBindingHash, client.id],
  )
  const result = await query<{ id: string }>(
    `/* beginOAuthAuthorizationRequest insert */ INSERT INTO oauth_authorization_requests (
       client_id, user_id, browser_binding_hash, redirect_uri, state, resource, scopes,
       code_challenge, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9)
     RETURNING id`,
    [
      client.id,
      input.userId,
      browserBindingHash,
      input.redirectUri,
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
  const client = await getOAuthClient(input.clientId)
  if (!client) throw new OAuthProtocolError('unauthorized_client', 'client is not registered')
  assertClientAuthorizationRequest(client, input.redirectUri, scopes)
  return { client, codeChallenge, resource: resource.url, scopes, state: input.state }
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
       client.client_name
     FROM oauth_authorization_requests AS request
     JOIN oauth_clients AS client ON client.id = request.client_id
     WHERE request.id = $1
       AND request.user_id = $2
       AND request.browser_binding_hash = $3
       AND request.approved_at IS NULL
       AND request.denied_at IS NULL
       AND request.expires_at > CURRENT_TIMESTAMP
       AND client.revoked_at IS NULL
       AND request.redirect_uri = ANY(client.redirect_uris)`,
    [requestId, userId, browserBindingHash],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    client_name: row.client_name,
    resource: row.resource,
    scopes: row.scopes,
    expires_at: row.expires_at,
  }
}

export async function getOAuthAuthorizationErrorRedirect(input: {
  clientId: string
  redirectUri: string
  state: unknown
  error: OAuthProtocolError
}): Promise<string | null> {
  const client = await getOAuthClient(input.clientId)
  if (!client?.redirect_uris.includes(input.redirectUri)) return null
  return buildOAuthAuthorizationResponseUrl(input.redirectUri, {
    error: input.error.code,
    error_description: input.error.message,
    ...(typeof input.state === 'string' && input.state.length <= 1024
      ? { state: input.state }
      : {}),
  })
}
