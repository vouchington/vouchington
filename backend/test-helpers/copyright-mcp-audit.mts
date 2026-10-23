import { read } from '../data-stores/psql/index.mts'
import { decryptSecret } from '../modules/token-secrets/index.mts'
import sql from 'sql-template-strings'

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
  tool_name: string
  rationale_ciphertext: string
}

export async function readTestCopyrightDecisionRationales(recordedById: string) {
  const { rows } =
    await read<TestCopyrightDecisionRationale>(sql`/* readTestCopyrightDecisionRationales */
    SELECT id, copyright_notice_id, tool_name, rationale_ciphertext
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
