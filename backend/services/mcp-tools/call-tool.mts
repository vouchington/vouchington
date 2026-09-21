import { McpError, ErrorCode, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import onError from '@modules/on-error'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import {
  listToolsForSurface,
  isToolMcpEligible,
  isToolAllowedForPlan,
  getToolRequiredScopes,
} from '@voucha/tools/registry/select'
import { isToolAllowedForUser } from './authorization.mts'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import { hasEveryScope, type ApiScope } from '@modules/scopes'
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
  const mcpSurface = listToolsForSurface(config.surface, ALL_TOOLS)
  const tool = mcpSurface.find(t => t.schema.name === toolName)

  if (!tool || !isToolMcpEligible(tool)) {
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${toolName}`)
  }

  if (!isToolAllowedForUser(tool, user)) {
    throw new McpError(ErrorCode.InvalidRequest, `Tool not allowed for your role: ${toolName}`)
  }

  if (!isToolAllowedForPlan(tool, user)) {
    throw new McpError(ErrorCode.InvalidRequest, `Tool requires a higher plan: ${toolName}`)
  }

  const requiredScopes = getToolRequiredScopes(tool, config.surface)
  if (requiredScopes == null || !hasEveryScope(permissions, requiredScopes)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Tool requires scopes ${requiredScopes?.join(', ') ?? 'unavailable'}: ${toolName}`,
    )
  }

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
