import { read, write, type TransactionQuery } from '../data-stores/psql/index.mts'
import { decryptSecret, encryptSecret } from '../modules/token-secrets/index.mts'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function insertTestAccountCopyrightRationale(
  accountUserId: string,
  recordedById: string,
): Promise<string> {
  const rationaleId = uuidv7()
  await write(
    `/* insertTestAccountCopyrightRationale:terminalReview */
     INSERT INTO copyright_repeat_infringer_reviews
       (account_user_id, opened_at, outcome, outcome_at, rationale_ciphertext)
     VALUES ($1::uuid, CURRENT_TIMESTAMP, 'reinstatement', CURRENT_TIMESTAMP, 'synthetic-review')`,
    [accountUserId],
  )
  await write(
    `/* insertTestAccountCopyrightRationale:rationale */
     INSERT INTO copyright_decision_rationales
       (id, account_user_id, recorded_by_id, tool_name, rationale_ciphertext)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'reinstate_copyright_repeat_infringer', $4::text)`,
    [
      rationaleId,
      accountUserId,
      recordedById,
      encryptSecret('synthetic rationale', `copyright-decision-rationale:${rationaleId}`),
    ],
  )
  return rationaleId
}

/** Same account advisory lock and encrypted hold write as the production hold placement path. */
export async function placeTestAccountPreservationHold(
  query: TransactionQuery,
  accountUserId: string,
  placedById: string,
): Promise<void> {
  const holdId = uuidv7()
  await query(
    `/* placeTestAccountPreservationHold:lock */
     SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
    [accountUserId],
  )
  await query(
    `/* placeTestAccountPreservationHold:insert */
     INSERT INTO user_legal_preservation_holds
       (id, account_user_id, placed_by_id, reference_ciphertext)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text)`,
    [
      holdId,
      accountUserId,
      placedById,
      encryptSecret('synthetic hold', `user-legal-preservation-hold:${holdId}`),
    ],
  )
}

export type TestCopyrightMcpAuditRow = {
  id: string
  correlation_id: string
  jsonrpc_method: string | null
  tool_name: string | null
  outcome: string
}

/** Reads the persisted audit identity needed to verify its authenticated ciphertext. */
export async function readTestCopyrightMcpAuditRows(actorUserId: string) {
  const { rows } = await read<TestCopyrightMcpAuditRow>(sql`/* readTestCopyrightMcpAuditRows */
    SELECT id, correlation_id, jsonrpc_method, tool_name, outcome
    FROM mcp_call_audit_events
    WHERE actor_user_id = ${actorUserId}
    ORDER BY id
  `)
  return rows
}

export type TestCopyrightDecisionRationale = {
  id: string
  copyright_notice_id: string | null
  account_user_id: string | null
  tool_name: string
  rationale_ciphertext: string
}

export async function readTestCopyrightDecisionRationales(recordedById: string) {
  const { rows } =
    await read<TestCopyrightDecisionRationale>(sql`/* readTestCopyrightDecisionRationales */
    SELECT id, copyright_notice_id, account_user_id, tool_name, rationale_ciphertext
    FROM copyright_decision_rationales
    WHERE recorded_by_id = ${recordedById}
    ORDER BY id
  `)
  return rows
}

export function decryptTestCopyrightDecisionRationale(
  row: Pick<TestCopyrightDecisionRationale, 'id' | 'rationale_ciphertext'>,
  rationaleRowId = row.id,
): string {
  if (!row.rationale_ciphertext) throw new Error('Decision rationale missing')
  return decryptSecret(row.rationale_ciphertext, `copyright-decision-rationale:${rationaleRowId}`)
}
