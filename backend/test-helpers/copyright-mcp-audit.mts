import { read } from '../data-stores/psql/index.mts'
import { decryptSecret } from '../modules/token-secrets/index.mts'
import sql from 'sql-template-strings'

export type TestCopyrightMcpAuditRow = {
  id: string
  correlation_id: string
  jsonrpc_method: string | null
  tool_name: string | null
  outcome: string
  copyright_rationale_ciphertext: string | null
}

/** Reads the persisted audit identity needed to verify its authenticated ciphertext. */
export async function readTestCopyrightMcpAuditRows(actorUserId: string) {
  const { rows } = await read<TestCopyrightMcpAuditRow>(sql`/* readTestCopyrightMcpAuditRows */
    SELECT id, correlation_id, jsonrpc_method, tool_name, outcome,
      copyright_rationale_ciphertext
    FROM mcp_call_audit_events
    WHERE actor_user_id = ${actorUserId}
    ORDER BY id
  `)
  return rows
}

export function decryptTestCopyrightMcpRationale(
  row: Pick<TestCopyrightMcpAuditRow, 'id' | 'copyright_rationale_ciphertext'>,
  auditRowId = row.id,
): string {
  if (!row.copyright_rationale_ciphertext) throw new Error('Audit rationale missing')
  return decryptSecret(
    row.copyright_rationale_ciphertext,
    `mcp-copyright-decision-rationale:${auditRowId}`,
  )
}
