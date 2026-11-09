import type { AuthorizationRequestRow } from './consent-types.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { OAuthProtocolError } from '@vouchington/oauth-server'

export async function recordOAuthGrantConsent(
  request: AuthorizationRequestRow,
  query: TransactionQuery,
  mfaVerifiedAt: number | undefined,
): Promise<string> {
  const result = await query<{ id: string }>(
    `/* upsertGrant */ INSERT INTO oauth_grants (user_id, client_id, resource, scopes, mfa_verified_at)
     SELECT $1, $2, $3, $4::api_scopes[], to_timestamp($5::double precision)
     WHERE EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = $1 AND lifted_at IS NULL)
       AND EXISTS (SELECT 1 FROM oauth_clients AS client WHERE id = $2 AND revoked_at IS NULL
         AND (owner_user_id IS NULL OR EXISTS (
           SELECT 1 FROM users WHERE id = client.owner_user_id AND deleted_at IS NULL
         )))
     ON CONFLICT (user_id, client_id, resource) WHERE revoked_at IS NULL AND session_id IS NULL
     DO UPDATE SET scopes = EXCLUDED.scopes,
                   mfa_verified_at = EXCLUDED.mfa_verified_at,
                   consented_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [request.user_id, request.client_id, request.resource, request.scopes, mfaVerifiedAt ?? null],
  )
  const row = result.rows[0]
  if (!row)
    throw new OAuthProtocolError('access_denied', 'authorization request is unavailable', 403)
  return row.id
}

/** This is the original verified session instant, never grant creation time. */
export function assertOAuthMfaTimestamp(verifiedAt: number | undefined): void {
  if (
    verifiedAt !== undefined &&
    (!Number.isSafeInteger(verifiedAt) ||
      verifiedAt <= 0 ||
      verifiedAt > Math.floor(Date.now() / 1000))
  )
    throw new OAuthProtocolError('access_denied', 'session assurance is invalid', 403)
}
