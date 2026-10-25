import { resolveMcpToolCall } from './resolve-tool-call.mts'
import { listMcpToolsForUser } from './list-tools.mts'
import { callMcpTool } from './call-tool.mts'
import { mcpToolCallIsDispatched } from './classify-calls.mts'
import { buildRateLimitedToolResult } from './rate-limited-result.mts'
import { handleStatelessMcpRequest } from '@vouchington/mcp-server/http'
import { MCP_SERVER_INSTRUCTIONS } from './instructions.mts'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'
import type { McpHttpResponse } from './http-response.mts'

type McpRequestContext = {
  copyrightDecisionToolsEnabled?: boolean
  user: BasicUser & {
    membership_plan: 'plus' | 'pro' | null
    suspended?: boolean
  }
  permissions: readonly ApiScope[]
  request: Request
  parsedBody: unknown
  config: McpServerConfig
  // Awaited after an admitted tool call returns an error result, so the caller can record it.
  onToolError?: (toolName: string, option?: string) => Promise<void>
  onToolRateLimited?: (toolName: string, messageIndex: number, option?: string) => Promise<void>
  // Fired once when a dispatched tools/call settles. Analytics only; it must not change the result.
  onToolCallSettled?: (
    messageIndex: number,
    settlement: { durationMs: number | null; toolError: boolean; rateLimited: boolean },
  ) => void
  clientIp?: string
  // The retry delay of each `tools/call` whose REST route bucket was spent, by message index.
  // Those calls are refused in-band without running, and are already audited as rate limited.
  rateLimitedCalls: ReadonlyMap<number, { retryAfterSeconds: number; message?: string }>
}

export function handleMcpHttpRequest(ctx: McpRequestContext): Promise<McpHttpResponse> {
  return handleStatelessMcpRequest({
    serverInfo: { name: ctx.config.serverName, version: '1.0.0' },
    instructions: MCP_SERVER_INSTRUCTIONS[ctx.config.audience],
    request: ctx.request,
    parsedBody: ctx.parsedBody,
    listTools: () =>
      listMcpToolsForUser(ctx.user, ctx.permissions, ctx.config, ctx.copyrightDecisionToolsEnabled),
    callTool: (call, controls) =>
      callMcpTool(
        call.name,
        call.arguments,
        ctx.user,
        ctx.permissions,
        ctx.config,
        ctx.copyrightDecisionToolsEnabled,
        { ip: ctx.clientIp, ...controls },
      ),
    isDispatchedToolCall: mcpToolCallIsDispatched,
    rateLimitedCalls: ctx.rateLimitedCalls,
    buildRateLimitedResult: rateLimit =>
      buildRateLimitedToolResult(rateLimit.retryAfterSeconds, rateLimit.message),
    resolveAuditOption: call => {
      const resolution = resolveMcpToolCall(
        call.name,
        ctx.user,
        ctx.permissions,
        ctx.config,
        ctx.copyrightDecisionToolsEnabled,
      )
      return resolution.status === 'allowed'
        ? (resolution.tool.meta?.auditOption?.(call.arguments) ?? undefined)
        : undefined
    },
    hooks: {
      onToolError: ctx.onToolError,
      onToolRateLimited: ctx.onToolRateLimited,
      onToolCallSettled: ctx.onToolCallSettled,
    },
  })
}
