import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'
import type { McpServerConfig } from './config.mts'

// Mirrors the mcp_call_audit_events.outcome CHECK. `accepted` means the call passed authentication
// and authorization and was handed to the MCP server; `tool_error` is the follow-up row for an
// admitted tool call that then failed.
export type McpCallAuditOutcome =
  | 'accepted'
  | 'tool_error'
  | 'invalid_request'
  | 'invalid_arguments'
  | 'not_found'
  | 'role_denied'
  | 'plan_denied'
  | 'scopes_undeclared'
  | 'insufficient_scope'
  | 'rate_limited'

// Deliberately holds no arguments and no result content: only the method, the registered tool name,
// and the outcome are durable.
export type McpCallAuditEvent = {
  jsonrpcMethod: string | null
  toolName: string | null
  outcome: McpCallAuditOutcome
}

export type McpCallAuditContext = {
  surface: McpServerConfig['surface']
  correlationId: string
  actorUserId: string
  // The public OAuth client_id string, not the internal row id.
  oauthClientId: string
  resource: string
}

export function createMcpCallAuditContext(
  config: McpServerConfig,
  actorUserId: string,
  oauthClientId: string,
): McpCallAuditContext {
  return {
    surface: config.surface,
    correlationId: randomUUID(),
    actorUserId,
    oauthClientId,
    resource: getOAuthResourceUrl(config.audience),
  }
}

// One batched insert per request. It throws unless every event was stored, including when the
// client row no longer exists, so a caller can refuse to run a call it could not record.
export async function recordMcpCallAudit(
  context: McpCallAuditContext,
  events: readonly McpCallAuditEvent[],
): Promise<void> {
  if (events.length === 0) return
  const result = await write(
    `/* recordMcpCallAudit */
    INSERT INTO mcp_call_audit_events
      (surface, correlation_id, actor_user_id, oauth_client_id, resource,
       jsonrpc_method, tool_name, outcome)
    SELECT $1, $2::uuid, $3::uuid, client.id, $4, event.jsonrpc_method, event.tool_name, event.outcome
    FROM oauth_clients AS client
    CROSS JOIN unnest($6::text[], $7::text[], $8::text[])
      WITH ORDINALITY AS event(jsonrpc_method, tool_name, outcome, ordinal)
    WHERE client.client_id = $5
    ORDER BY event.ordinal`,
    [
      context.surface,
      context.correlationId,
      context.actorUserId,
      context.resource,
      context.oauthClientId,
      events.map(event => event.jsonrpcMethod),
      events.map(event => event.toolName),
      events.map(event => event.outcome),
    ],
  )
  if (result.rowCount !== events.length) throw new Error('MCP call audit was not recorded')
}
