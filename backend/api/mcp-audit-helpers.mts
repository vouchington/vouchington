import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import {
  createMcpCallAuditContext,
  recordMcpCallAudit,
  type McpCallAuditEvent,
  type McpCallAuditOutcome,
  type McpServerConfig,
} from '@services/mcp-tools'

export type McpRequestAudit = {
  // Write-ahead and fail-closed: when the rows cannot be stored the request ends with a 503 and the
  // call never runs.
  record: (events: readonly McpCallAuditEvent[]) => Promise<void>
  // Best effort, after the call has already run: a lost follow-up row must not fail its response.
  recordToolError: (toolName: string) => Promise<void>
}

// A rejection that happens before any JSON-RPC message is read has no method or tool to name.
export function unreadMcpCall(outcome: McpCallAuditOutcome): McpCallAuditEvent {
  return { jsonrpcMethod: null, toolName: null, outcome }
}

// Only a verified OAuth principal has the actor and client the audit needs, so an unauthenticated
// request never writes a row. Returns null on a surface that does not audit calls.
export function startMcpRequestAudit(
  ctx: Context,
  config: McpServerConfig,
  principal: { ownerId: string; oauthClientId: string | null },
): McpRequestAudit | null {
  if (!config.auditCalls || principal.oauthClientId === null) return null
  const context = createMcpCallAuditContext(config, principal.ownerId, principal.oauthClientId)
  ctx.set('X-Correlation-Id', context.correlationId)
  return {
    async record(events) {
      try {
        await recordMcpCallAudit(context, events)
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
        ctx.throw(503, 'Audit log unavailable')
      }
    },
    async recordToolError(toolName) {
      try {
        await recordMcpCallAudit(context, [
          { jsonrpcMethod: 'tools/call', toolName, outcome: 'tool_error' },
        ])
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    },
  }
}
