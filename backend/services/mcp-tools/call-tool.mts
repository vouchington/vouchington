import { McpError, ErrorCode, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import onError from '@modules/on-error'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'
import { resolveMcpToolCall, type McpToolCallResolution } from './resolve-tool-call.mts'
import { validateToolArguments } from './validate-tool-arguments.mts'
import { serializeMcpToolResult } from './serialize-mcp-tool-result.mts'

export {
  MAX_MCP_TOOL_RESULT_BYTES,
  MAX_MCP_TOOL_RESULT_VISITS,
  serializeMcpToolResult,
} from './serialize-mcp-tool-result.mts'

type UserForCall = BasicUser & {
  membership_plan: 'plus' | 'pro' | null
}

export async function callMcpTool(
  toolName: string,
  args: unknown,
  user: UserForCall,
  permissions: readonly ApiScope[],
  config: McpServerConfig,
): Promise<CallToolResult> {
  const resolution = resolveMcpToolCall(toolName, user, permissions, config)
  if (resolution.status !== 'allowed') throw toMcpToolCallError(resolution, toolName)
  const { tool } = resolution

  const validationError = validateToolArguments(tool.schema.parameters, args)
  if (validationError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid tool arguments: ${validationError}`)
  }

  try {
    const result = await tool.function(user)(args as never)
    return {
      content: [{ type: 'text', text: serializeMcpToolResult(result) }],
    }
  } catch (err) {
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
