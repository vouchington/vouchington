import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import {
  createMcpCallAuditContext,
  recordMcpCallAudit,
  type McpCallAuditCredential,
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
  recordToolRateLimit: (toolName: string) => Promise<void>
}

// A rejection that happens before any JSON-RPC message is read has no method or tool to name.
export function unreadMcpCall(outcome: McpCallAuditOutcome): McpCallAuditEvent {
  return { jsonrpcMethod: null, toolName: null, outcome }
}

// Only a verified credential (an OAuth access token, or an API key on a surface that accepts them)
// has the actor and credential identity the audit needs, so an unauthenticated request never writes
// a row. Returns null on a surface that does not audit calls.
export function startMcpRequestAudit(
  ctx: Context,
  config: McpServerConfig,
  principal: { ownerId: string; credential: McpCallAuditCredential },
): McpRequestAudit | null {
  if (!config.auditCalls) return null
  const context = createMcpCallAuditContext(config, principal.ownerId, principal.credential)
  ctx.set('X-Correlation-Id', context.correlationId)
  return {
    async record(events) {
      try {
        await recordMcpCallAudit(context, events)
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
        ctx.throw(503, 'Audit log unavailable')
      }
    },
    async recordToolError(toolName) {
      try {
        await recordMcpCallAudit(context, [
          { jsonrpcMethod: 'tools/call', toolName, outcome: 'tool_error' },
        ])
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    async recordToolRateLimit(toolName) {
      try {
        await recordMcpCallAudit(context, [
          { jsonrpcMethod: 'tools/call', toolName, outcome: 'rate_limited' },
        ])
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    },
  }
}
