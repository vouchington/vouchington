import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
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

// Only validated copyright decision calls may carry a rationale; arbitrary arguments and results
// remain absent from this event.
export type McpCallAuditEvent = {
  jsonrpcMethod: string | null
  toolName: string | null
  outcome: McpCallAuditOutcome
  copyrightRationale?: string
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
  const eventIds = events.map(() => uuidv7())
  const result = await write(
    `/* recordMcpCallAudit */
    INSERT INTO mcp_call_audit_events
      (id, surface, correlation_id, actor_user_id, oauth_client_id, api_key_id, resource,
       jsonrpc_method, tool_name, outcome, copyright_rationale_ciphertext)
    SELECT event.id, $1, $2::uuid, $3::uuid, subject.oauth_client_id, subject.api_key_id, $4,
      event.jsonrpc_method, event.tool_name, event.outcome, event.copyright_rationale_ciphertext
    FROM (
      SELECT client.id AS oauth_client_id, NULL::uuid AS api_key_id
      FROM oauth_clients AS client
      WHERE client.client_id = $5::text
      UNION ALL
      SELECT NULL::uuid, $6::uuid WHERE $6::uuid IS NOT NULL
    ) AS subject
    CROSS JOIN unnest($7::uuid[], $8::text[], $9::text[], $10::mcp_call_audit_event_outcomes[], $11::text[])
      WITH ORDINALITY AS event(id, jsonrpc_method, tool_name, outcome, copyright_rationale_ciphertext, ordinal)
    ORDER BY event.ordinal`,
    [
      context.surface,
      context.correlationId,
      context.actorUserId,
      context.resource,
      credential.credential === 'oauth' ? credential.oauthClientId : null,
      credential.credential === 'api_key' ? credential.apiKeyId : null,
      eventIds,
      events.map(event => event.jsonrpcMethod),
      events.map(event => event.toolName),
      events.map(event => event.outcome),
      events.map((event, index) =>
        event.copyrightRationale === undefined
          ? null
          : encryptSecret(
              event.copyrightRationale,
              `mcp-copyright-decision-rationale:${eventIds[index]}`,
            ),
      ),
    ],
  )
  if (result.rowCount !== events.length) throw new Error('MCP call audit was not recorded')
}
