import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction, read, write } from '@data-stores/psql'

/** Synthetic consent with an old event clock and a real live grant/retained identity. */
export async function createTestOldOAuthConsent(input: {
  userId: string
  clientId: string
  occurredAt: Date
}): Promise<{ eventId: string; grantId: string }> {
  const grantId = uuidv7()
  const eventId = uuidv7({ msecs: input.occurredAt.getTime() })
  await write(
    `/* createTestOldOAuthConsent grant */ INSERT INTO oauth_grants
       (id, user_id, client_id, resource, scopes)
     SELECT $1, $2, client.id, 'https://test.voucha.ai/mcp', ARRAY['mcp.user:read']::api_scopes[]
     FROM oauth_clients client WHERE client.client_id = $3`,
    [grantId, input.userId, input.clientId],
  )
  await write(
    `/* createTestOldOAuthConsent event */ INSERT INTO oauth_authorization_server_events
       (id, event_type, authorization_request_id, user_id, client_id, grant_id, resource, scopes)
     SELECT $1, 'consent_approved', $2, $3, client.id, $4,
       'https://test.voucha.ai/mcp', ARRAY['mcp.user:read']::api_scopes[]
     FROM oauth_clients client WHERE client.client_id = $5`,
    [eventId, randomUUID(), input.userId, grantId, input.clientId],
  )
  return { eventId, grantId }
}

export async function deleteTestOldOAuthConsent(eventId: string, cutoff: Date): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* deleteTestOldOAuthConsent */ SELECT set_config('app.oauth_event_retention_cutoff', $1, true)`,
    [cutoff.toISOString()],
  )
  await query(
    `/* deleteTestOldOAuthConsent */ DELETE FROM oauth_authorization_server_events WHERE id = $1`,
    [eventId],
  )
  await query.commit()
}

export async function setTestOAuthGrantEnd(grantId: string, endedAt: Date): Promise<void> {
  await write(`/* setTestOAuthGrantEnd */ UPDATE oauth_grants SET revoked_at = $2 WHERE id = $1`, [
    grantId,
    endedAt,
  ])
}

export async function backdateTestOAuthGrantEnd(grantId: string, endedAt: Date): Promise<void> {
  await write(
    `/* backdateTestOAuthGrantEnd */ UPDATE oauth_grant_retention_anchors SET ended_at = $2 WHERE id = $1`,
    [grantId, endedAt],
  )
}

export async function deleteTestOAuthGrant(grantId: string): Promise<void> {
  await write(`/* deleteTestOAuthGrant */ DELETE FROM oauth_grants WHERE id = $1`, [grantId])
}

export async function oauthConsentExists(eventId: string): Promise<boolean> {
  const result = await read(
    `/* oauthConsentExists */ SELECT 1 FROM oauth_authorization_server_events WHERE id = $1`,
    [eventId],
  )
  return result.rows.length > 0
}

/** Confirms repeated native mints reuse one live grant without leaving proposed-id anchors. */
export async function getTestNativeGrantRetentionCounts(userId: string, sessionId: string) {
  const result = await read<{
    grant_count: number
    anchor_count: number
    mint_count: number
    distinct_mint_grants: number
  }>(
    `/* getTestNativeGrantRetentionCounts */ SELECT
       (SELECT count(*)::integer FROM oauth_grants WHERE user_id = $1 AND session_id = $2) AS grant_count,
       (SELECT count(*)::integer FROM oauth_grant_retention_anchors WHERE user_id = $1) AS anchor_count,
       (SELECT count(*)::integer FROM oauth_native_session_token_mints WHERE user_id = $1 AND session_id = $2) AS mint_count,
       (SELECT count(DISTINCT grant_id)::integer FROM oauth_native_session_token_mints
        WHERE user_id = $1 AND session_id = $2) AS distinct_mint_grants`,
    [userId, sessionId],
  )
  return result.rows[0]
}

export async function getTestNativeGrantRetentionState(userId: string, sessionId: string) {
  const result = await read<{ id: string; ended_at: Date | null }>(
    `/* getTestNativeGrantRetentionState */ SELECT oauth_grant.id, anchor.ended_at
     FROM oauth_grants oauth_grant
     JOIN oauth_grant_retention_anchors anchor ON anchor.id = oauth_grant.id
     WHERE oauth_grant.user_id = $1 AND oauth_grant.session_id = $2`,
    [userId, sessionId],
  )
  return result.rows[0]
}
