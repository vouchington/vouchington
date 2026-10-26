import { v7 as uuidv7 } from 'uuid'
import type { TransactionQuery } from '../data-stores/psql/index.mts'
import { encryptSecret } from '../modules/token-secrets/index.mts'

/** Creates aged denied consent against a real pending request and registered client. */
export async function insertTestOldDeniedOAuthEvent(
  query: TransactionQuery,
  input: { userId: string; requestId: string; occurredAt: Date },
): Promise<string> {
  const id = uuidv7({ msecs: input.occurredAt.getTime() })
  const result = await query(
    `/* insertTestOldDeniedOAuthEvent */
     INSERT INTO oauth_authorization_server_events
       (id, event_type, authorization_request_id, user_id, client_id, resource, scopes)
     SELECT $1::uuid, 'consent_denied', request.id, request.user_id,
       request.client_id, request.resource, request.scopes
     FROM oauth_authorization_requests request
     JOIN oauth_clients client ON client.id = request.client_id
     WHERE request.id = $2::uuid AND request.user_id = $3::uuid`,
    [id, input.requestId, input.userId],
  )
  if (result.rowCount !== 1) throw new Error('Pending OAuth request missing')
  return id
}

export async function positionTestOAuthEventRetentionCursor(
  query: TransactionQuery,
  beforeId: string,
): Promise<void> {
  await query(
    `/* positionTestOAuthEventRetentionCursor */
     INSERT INTO security_retention_cleanup_cursors (source, cursor_id)
     VALUES ('oauth_events', $1::uuid)
     ON CONFLICT (source) DO UPDATE SET cursor_at = NULL, cursor_id = EXCLUDED.cursor_id`,
    [beforeId],
  )
}

export async function testOAuthEventExists(query: TransactionQuery, id: string): Promise<boolean> {
  const result = await query(
    `/* testOAuthEventExists */ SELECT 1 FROM oauth_authorization_server_events
     WHERE id = $1::uuid`,
    [id],
  )
  return result.rowCount === 1
}

export async function releaseTestOpenPreservationHold(
  query: TransactionQuery,
  accountUserId: string,
  releasedById: string,
): Promise<void> {
  const result = await query(
    `/* releaseTestOpenPreservationHold */
     UPDATE user_legal_preservation_holds
     SET released_at = CURRENT_TIMESTAMP, released_by_id = $2::uuid
     WHERE account_user_id = $1::uuid AND released_at IS NULL`,
    [accountUserId, releasedById],
  )
  if (result.rowCount !== 1) throw new Error('Open preservation hold missing')
}

/** Two account rationales straddling a six-year cutoff; both have one older terminal review. */
export async function insertTestRationaleAgePair(
  query: TransactionQuery,
  accountUserId: string,
  recordedById: string,
  olderAt: Date,
  youngerAt: Date,
): Promise<readonly [string, string]> {
  const olderId = uuidv7({ msecs: olderAt.getTime() })
  const youngerId = uuidv7({ msecs: youngerAt.getTime() })
  await query(
    `/* insertTestRationaleAgePair:review */
     INSERT INTO copyright_repeat_infringer_reviews
       (account_user_id, opened_at, outcome, outcome_at, rationale_ciphertext)
     VALUES ($1::uuid, $2::timestamptz, 'reinstatement', $2::timestamptz, 'synthetic-review')`,
    [accountUserId, olderAt],
  )
  await query(
    `/* insertTestRationaleAgePair:rationales */
     INSERT INTO copyright_decision_rationales
       (id, account_user_id, recorded_by_id, tool_name, rationale_ciphertext)
     VALUES ($1::uuid, $3::uuid, $4::uuid,
       'reinstate_copyright_repeat_infringer', $5::text),
       ($2::uuid, $3::uuid, $4::uuid,
       'reinstate_copyright_repeat_infringer', $6::text)`,
    [
      olderId,
      youngerId,
      accountUserId,
      recordedById,
      encryptSecret('older rationale', `copyright-decision-rationale:${olderId}`),
      encryptSecret('younger rationale', `copyright-decision-rationale:${youngerId}`),
    ],
  )
  return [olderId, youngerId]
}

export async function testRationaleRetentionEligible(
  query: TransactionQuery,
  id: string,
  cutoffAt: Date,
): Promise<boolean> {
  const result = await query<{ eligible: boolean }>(
    `/* testRationaleRetentionEligible */
     SELECT fn_copyright_decision_rationale_retention_eligible(target, $2::timestamptz) AS eligible
     FROM copyright_decision_rationales target WHERE target.id = $1::uuid`,
    [id, cutoffAt],
  )
  if (!result.rows[0]) throw new Error('Copyright rationale missing')
  return result.rows[0].eligible
}
