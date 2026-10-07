import { McpError, ErrorCode, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import onError from '@modules/on-error'
import { isHttpError } from 'http-errors'
import {
  CONFLICT,
  FORBIDDEN,
  INVALID_INPUT,
  NOT_FOUND,
  CONTRIBUTION_ADMISSION_IN_PROGRESS,
  CONTRIBUTION_QUOTA_EXCEEDED,
  IDEMPOTENCY_KEY_REUSED,
} from '@modules/on-error/error-codes'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
import { resolveMcpToolCall, type McpToolCallResolution } from './resolve-tool-call.mts'
import { validateToolArguments } from './validate-tool-arguments.mts'
import { buildToolResult } from './build-tool-result.mts'
import { McpToolResultTooLargeError } from './serialize-mcp-tool-result.mts'
import { buildRateLimitedToolResult } from './rate-limited-result.mts'
import { ToolRateLimitError } from '@services/openai-agents/tool-rate-limit-error'

export const MCP_TOOL_RESULT_TOO_LARGE_TEXT =
  'The tool result is too large to return. Narrow the query or lower the limit, then try again.'

type UserForCall = BasicUser & {
  membership_plan: 'plus' | 'pro' | null
}

export async function callMcpTool(
  toolName: string,
  args: unknown,
  user: UserForCall,
  permissions: readonly ApiScope[],
  config: McpServerConfig,
  copyrightDecisionToolsEnabled = false,
  rateLimitContext?: { ip: string | undefined; onRateLimited: () => Promise<void> },
): Promise<CallToolResult> {
  const resolution = resolveMcpToolCall(
    toolName,
    user,
    permissions,
    config,
    copyrightDecisionToolsEnabled,
  )
  if (resolution.status !== 'allowed') throw toMcpToolCallError(resolution, toolName)
  const { tool } = resolution

  const validationError = validateToolArguments(tool.schema.parameters, args)
  if (validationError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid tool arguments: ${validationError}`)
  }

  try {
    const invocationContext: ToolInvocationContext = {
      credentialOwnerId: user.id,
      grantedScopes: permissions,
      ...(rateLimitContext ? { mcpRateLimit: { ip: rateLimitContext.ip } } : {}),
    }
    const result = await tool.function(user)(args as never, invocationContext)
    return buildToolResult(toolName, result, tool.meta?.outputSchema)
  } catch (err) {
    if (err instanceof ToolRateLimitError) {
      await rateLimitContext?.onRateLimited()
      return buildRateLimitedToolResult(err.retryAfterSeconds)
    }
    // An oversized result is fixed by asking for less, so it goes back to the caller unreported.
    if (err instanceof McpToolResultTooLargeError) {
      return { isError: true, content: [{ type: 'text', text: MCP_TOOL_RESULT_TOO_LARGE_TEXT }] }
    }
    if (isHttpError(err) && err.status >= 400 && err.status < 500) {
      const code =
        err.status === 404
          ? NOT_FOUND
          : err.status === 409
            ? CONFLICT
            : err.status === 403
              ? FORBIDDEN
              : INVALID_INPUT
      const admissionCodes = [
        CONTRIBUTION_ADMISSION_IN_PROGRESS,
        CONTRIBUTION_QUOTA_EXCEEDED,
        IDEMPOTENCY_KEY_REUSED,
      ]
      const admissionCode =
        typeof err['code'] === 'string' && admissionCodes.includes(err['code']) ? err['code'] : null
      const retryAfterSeconds = err['retryAfterSeconds']
      const error = {
        status: err.status,
        code: admissionCode ?? code,
        message: err.message,
        retryable: admissionCode === CONTRIBUTION_ADMISSION_IN_PROGRESS,
        ...(admissionCode && Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
          ? { retryAfterSeconds }
          : {}),
      }
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error }) }] }
    }
    onError(err instanceof Error ? err : new Error(String(err)))
    return {
      isError: true,
      content: [{ type: 'text', text: 'Tool execution failed. Please try again.' }],
    }
  }
}

function toMcpToolCallError(
  resolution: Exclude<McpToolCallResolution, { status: 'allowed' }>,
  toolName: string,
): McpError {
  switch (resolution.status) {
    case 'not_found':
      return new McpError(ErrorCode.MethodNotFound, `Tool not found: ${toolName}`)
    case 'role_denied':
      return new McpError(ErrorCode.InvalidRequest, `Tool not allowed for your role: ${toolName}`)
    case 'plan_denied':
      return new McpError(ErrorCode.InvalidRequest, `Tool requires a higher plan: ${toolName}`)
    case 'scopes_undeclared':
      return new McpError(ErrorCode.InvalidRequest, `Tool requires scopes unavailable: ${toolName}`)
    case 'insufficient_scope':
      return new McpError(
        ErrorCode.InvalidRequest,
        `Tool requires scopes ${resolution.requiredScopes.join(', ')}: ${toolName}`,
      )
  }
}
