import { read, write } from '@data-stores/psql'

export type TestMcpCallAuditEvent = {
  surface: string
  correlation_id: string
  actor_user_id: string
  oauth_client_id: string
  resource: string
  jsonrpc_method: string | null
  tool_name: string | null
  outcome: string
  occurred_at: Date
}

// Every audit row written for the actor, oldest first, with the client's public OAuth client_id
// string (the table stores the internal client row id).
export async function readTestMcpCallAuditEvents(
  actorUserId: string,
): Promise<TestMcpCallAuditEvent[]> {
  const result = await read<TestMcpCallAuditEvent>(
    `/* readTestMcpCallAuditEvents */ SELECT
       event.surface, event.correlation_id, event.actor_user_id,
       client.client_id AS oauth_client_id, event.resource, event.jsonrpc_method,
       event.tool_name, event.outcome, event.occurred_at
     FROM mcp_call_audit_events AS event
     JOIN oauth_clients AS client ON client.id = event.oauth_client_id
     WHERE event.actor_user_id = $1
     ORDER BY event.id`,
    [actorUserId],
  )
  return result.rows
}

// The whole stored row as text, for asserting that no secret or argument was ever persisted.
export async function readTestMcpCallAuditRowText(actorUserId: string): Promise<string[]> {
  const result = await read<{ row_text: string }>(
    `/* readTestMcpCallAuditRowText */ SELECT event::text AS row_text
     FROM mcp_call_audit_events AS event
     WHERE event.actor_user_id = $1
     ORDER BY event.id`,
    [actorUserId],
  )
  return result.rows.map(row => row.row_text)
}

// Attempts to rewrite every audit row of the actor, for asserting that the log is append-only.
export async function updateTestMcpCallAuditOutcomes(actorUserId: string): Promise<void> {
  await write(
    `/* updateTestMcpCallAuditOutcomes */ UPDATE mcp_call_audit_events
     SET outcome = 'accepted'
     WHERE actor_user_id = $1`,
    [actorUserId],
  )
}

// Attempts to remove every audit row of the actor, for asserting that the log is append-only.
export async function deleteTestMcpCallAuditEvents(actorUserId: string): Promise<void> {
  await write(
    `/* deleteTestMcpCallAuditEvents */ DELETE FROM mcp_call_audit_events
     WHERE actor_user_id = $1`,
    [actorUserId],
  )
}
