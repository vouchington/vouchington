import { randomBytes } from 'node:crypto'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { AUTHORIZATION_CODE_TTL_MS, OAUTH_SECRET_PURPOSES } from './constants.mts'
import { OAuthProtocolError } from './errors.mts'
import type { ApiScope } from '@modules/scopes'

type AuthorizationRequestRow = {
  id: string
  client_id: string
  user_id: string
  redirect_uri: string
  state: string
  resource: string
  scopes: ApiScope[]
  code_challenge: string
}

export async function decideOAuthAuthorizationRequest(
  userId: string,
  requestId: string,
  decision: 'approve' | 'deny',
  browserBindingHash: string,
): Promise<{ redirect_uri: string }> {
  await using query = await beginTransaction()
  const request = await lockAuthorizationRequest(userId, requestId, browserBindingHash, query)
  if (!request) {
    throw new OAuthProtocolError('access_denied', 'authorization request is unavailable', 403)
  }

  if (decision === 'deny') {
    await insertConsentDecision(request, decision, null, query)
    await query(
      `/* decideOAuthAuthorizationRequest deny */ UPDATE oauth_authorization_requests
       SET denied_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [request.id],
    )
    await query.commit()
    return { redirect_uri: buildAuthorizationRedirect(request, { error: 'access_denied' }) }
  }

  const grantId = await upsertGrant(request, query)
  await insertConsentDecision(request, decision, grantId, query)
  const rawCode = `voucha_code_${randomBytes(32).toString('base64url')}`
  await query(
    `/* decideOAuthAuthorizationRequest code */ INSERT INTO oauth_authorization_codes (
       id, code_hash, grant_id, redirect_uri, resource, scopes, code_challenge, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8)`,
    [
      uuidv7(),
      hashToken(OAUTH_SECRET_PURPOSES.authorizationCode, rawCode),
      grantId,
      request.redirect_uri,
      request.resource,
      request.scopes,
      request.code_challenge,
      new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    ],
  )
  await query(
    `/* decideOAuthAuthorizationRequest approve */ UPDATE oauth_authorization_requests
     SET approved_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [request.id],
  )
  await query.commit()
  return { redirect_uri: buildAuthorizationRedirect(request, { code: rawCode }) }
}

async function insertConsentDecision(
  request: AuthorizationRequestRow,
  decision: 'approve' | 'deny',
  grantId: string | null,
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* insertConsentDecision */ INSERT INTO oauth_authorization_server_events (
       event_type, authorization_request_id, user_id, client_id, grant_id, resource, scopes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[])`,
    [
      decision === 'approve' ? 'consent_approved' : 'consent_denied',
      request.id,
      request.user_id,
      request.client_id,
      grantId,
      request.resource,
      request.scopes,
    ],
  )
}

async function lockAuthorizationRequest(
  userId: string,
  requestId: string,
  browserBindingHash: string,
  query: TransactionQuery,
): Promise<AuthorizationRequestRow | null> {
  const result = await query<AuthorizationRequestRow>(
    `/* lockAuthorizationRequest */ SELECT request.*
     FROM oauth_authorization_requests AS request
     JOIN oauth_clients AS client ON client.id = request.client_id
     WHERE request.id = $1
       AND request.user_id = $2
       AND request.browser_binding_hash = $3
       AND request.approved_at IS NULL
       AND request.denied_at IS NULL
       AND request.expires_at > CURRENT_TIMESTAMP
       AND client.revoked_at IS NULL
     FOR UPDATE OF request`,
    [requestId, userId, browserBindingHash],
  )
  return result.rows[0] ?? null
}

async function upsertGrant(
  request: AuthorizationRequestRow,
  query: TransactionQuery,
): Promise<string> {
  const result = await query<{ id: string }>(
    `/* upsertGrant */ INSERT INTO oauth_grants (user_id, client_id, resource, scopes)
     VALUES ($1, $2, $3, $4::text[])
     ON CONFLICT (user_id, client_id, resource) WHERE revoked_at IS NULL
     DO UPDATE SET scopes = EXCLUDED.scopes,
                   consented_at = CURRENT_TIMESTAMP,
                   last_used_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [request.user_id, request.client_id, request.resource, request.scopes],
  )
  const row = result.rows[0]
  if (!row) throw new OAuthProtocolError('server_error', 'authorization grant was not created', 503)
  return row.id
}

function buildAuthorizationRedirect(
  request: Pick<AuthorizationRequestRow, 'redirect_uri' | 'state'>,
  result: { code: string } | { error: string },
): string {
  const redirect = new URL(request.redirect_uri)
  if ('code' in result) redirect.searchParams.set('code', result.code)
  else redirect.searchParams.set('error', result.error)
  redirect.searchParams.set('state', request.state)
  return redirect.toString()
}
