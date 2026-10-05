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

// The verified credential a call was made with. Its `credential` tag matches the MCP authentication
// result, so that result can be passed straight in; the context copies out only the identifier.
export type McpCallAuditCredential =
  // The public OAuth client_id string, not the internal row id.
  | { credential: 'oauth'; oauthClientId: string }
  // The api_keys row id, which is also the key's retained identity id.
  | { credential: 'api_key'; apiKeyId: string }

export type McpCallAuditContext = {
  surface: McpServerConfig['surface']
  correlationId: string
  actorUserId: string
  credential: McpCallAuditCredential
  resource: string
}

export function createMcpCallAuditContext(
  config: McpServerConfig,
  actorUserId: string,
  credential: McpCallAuditCredential,
): McpCallAuditContext {
  return {
    surface: config.surface,
    correlationId: randomUUID(),
    actorUserId,
    credential:
      credential.credential === 'oauth'
        ? { credential: 'oauth', oauthClientId: credential.oauthClientId }
        : { credential: 'api_key', apiKeyId: credential.apiKeyId },
    resource: getOAuthResourceUrl(config.audience),
  }
}

// One batched insert per request. It throws unless every event was stored, including when the OAuth
// client row no longer exists or the API key has no retained identity (the foreign key rejects it),
// so a caller can refuse to run a call it could not record.
export async function recordMcpCallAudit(
  context: McpCallAuditContext,
  events: readonly McpCallAuditEvent[],
): Promise<void> {
  if (events.length === 0) return
  const { credential } = context
  const result = await write(
    `/* recordMcpCallAudit */
    INSERT INTO mcp_call_audit_events
      (surface, correlation_id, actor_user_id, oauth_client_id, api_key_id, resource,
       jsonrpc_method, tool_name, outcome)
    SELECT $1, $2::uuid, $3::uuid, subject.oauth_client_id, subject.api_key_id, $4,
      event.jsonrpc_method, event.tool_name, event.outcome
    FROM (
      SELECT client.id AS oauth_client_id, NULL::uuid AS api_key_id
      FROM oauth_clients AS client
      WHERE client.client_id = $5::text
      UNION ALL
      SELECT NULL::uuid, $6::uuid WHERE $6::uuid IS NOT NULL
    ) AS subject
    CROSS JOIN unnest($7::text[], $8::text[], $9::mcp_call_audit_event_outcomes[])
      WITH ORDINALITY AS event(jsonrpc_method, tool_name, outcome, ordinal)
    ORDER BY event.ordinal`,
    [
      context.surface,
      context.correlationId,
      context.actorUserId,
      context.resource,
      credential.credential === 'oauth' ? credential.oauthClientId : null,
      credential.credential === 'api_key' ? credential.apiKeyId : null,
      events.map(event => event.jsonrpcMethod),
      events.map(event => event.toolName),
      events.map(event => event.outcome),
    ],
  )
  if (result.rowCount !== events.length) throw new Error('MCP call audit was not recorded')
}
