import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { createCodedError } from '@vouchington/sentry'
import { generateOpaqueToken } from '@vouchington/oauth-server'
import { getOAuthClientForAuthorization } from './clients.mts'
import {
  ACCESS_TOKEN_TTL_MS,
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_SECRET_PURPOSES,
} from './constants.mts'
import { lockOAuthParticipantUsers } from './active-users.mts'
import { getNativeOAuthClientDocument, type NativeOAuthClientApp } from './native-clients.mts'
import { getOAuthResourceUrl } from './resources.mts'

const NATIVE_MCP_SCOPES = ['mcp.user:read', 'mcp.user:write'] as const
const denied = (message: string) => createCodedError(403, message, 'NATIVE_MCP_MINT_DENIED')

export type NativeMcpMintResult = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
  resource: string
}

/** Issues one session-bound member MCP token and its durable audit row atomically. */
export async function mintNativeSessionMcpToken(
  currentUserId: string,
  input: {
    did: string
    sid: string
    clientApp: NativeOAuthClientApp
    attestationStatus: 'attested' | 'unattested'
  },
): Promise<NativeMcpMintResult> {
  const clientId = getNativeOAuthClientDocument(input.clientApp).client_id
  // This is a fixed, locally defined CIMD document, resolved through the existing client path.
  const client = await getOAuthClientForAuthorization(clientId)
  if (!client) throw denied('Native OAuth client unavailable')

  await using query = await beginTransaction()
  const activeUsers = await lockOAuthParticipantUsers([currentUserId], query)
  if (!activeUsers.has(currentUserId)) throw denied('Session is unavailable')
  const sessionResult = await query<{ expires_at: Date }>(
    `/* mintNativeSessionMcpToken session */ SELECT session.expires_at
     FROM user_sessions AS session
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.device_id = $3
       AND session.authentication_origin = 'native'
       AND session.revoked_at IS NULL
       AND session.expires_at > CURRENT_TIMESTAMP
       AND ($4 = 'attested' OR NOT EXISTS (
         SELECT 1 FROM app_attestation_keys AS attest WHERE attest.did = session.device_id
       ))
       AND NOT EXISTS (
         SELECT 1 FROM user_suspensions AS suspension
         WHERE suspension.user_id = session.user_id AND suspension.lifted_at IS NULL
       )
     FOR SHARE OF session`,
    [input.sid, currentUserId, input.did, input.attestationStatus],
  )
  const session = sessionResult.rows[0]
  if (!session) throw denied('Native session required')

  const clientResult = await query<{ id: string }>(
    `/* mintNativeSessionMcpToken client */ SELECT id FROM oauth_clients
     WHERE id = $1 AND client_id = $2 AND revoked_at IS NULL FOR SHARE`,
    [client.id, clientId],
  )
  if (!clientResult.rows[0]) throw denied('Native OAuth client unavailable')

  const resource = getOAuthResourceUrl('user')
  const grantResult = await query<{ id: string }>(
    `/* mintNativeSessionMcpToken grant */ INSERT INTO oauth_grants (
       user_id, client_id, session_id, attestation_status, resource, scopes, last_used_at
     ) VALUES ($1, $2, $3, $4, $5, $6::api_scopes[], CURRENT_TIMESTAMP)
     ON CONFLICT (session_id) WHERE session_id IS NOT NULL
     DO UPDATE SET last_used_at = CURRENT_TIMESTAMP,
                   attestation_status = EXCLUDED.attestation_status
       WHERE oauth_grants.revoked_at IS NULL
         AND oauth_grants.user_id = EXCLUDED.user_id
         AND oauth_grants.client_id = EXCLUDED.client_id
         AND oauth_grants.resource = EXCLUDED.resource
     RETURNING id`,
    [currentUserId, client.id, input.sid, input.attestationStatus, resource, NATIVE_MCP_SCOPES],
  )
  const grantId = grantResult.rows[0]?.id
  if (!grantId) throw denied('MCP connection was revoked for this session')

  const accessToken = generateOpaqueToken(OAUTH_ACCESS_TOKEN_PREFIX)
  const now = Date.now()
  const expiresAt = new Date(Math.min(now + ACCESS_TOKEN_TTL_MS, session.expires_at.getTime()))
  const tokenResult = await query<{ id: string }>(
    `/* mintNativeSessionMcpToken access */ INSERT INTO oauth_access_tokens (
       grant_id, token_hash, resource, scopes, expires_at
     ) VALUES ($1, $2, $3, $4::api_scopes[], $5) RETURNING id`,
    [
      grantId,
      hashToken(OAUTH_SECRET_PURPOSES.accessToken, accessToken),
      resource,
      NATIVE_MCP_SCOPES,
      expiresAt,
    ],
  )
  const tokenId = tokenResult.rows[0]?.id
  if (!tokenId) throw new Error('Native MCP access token was not persisted')
  await query(
    `/* mintNativeSessionMcpToken audit */ INSERT INTO oauth_native_session_token_mints (
       user_id, client_id, grant_id, session_id, access_token_id, attestation_status
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [currentUserId, client.id, grantId, input.sid, tokenId, input.attestationStatus],
  )
  await query.commit()
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000)),
    scope: NATIVE_MCP_SCOPES.join(' '),
    resource,
  }
}
