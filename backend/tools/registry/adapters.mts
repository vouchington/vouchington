import type { Tool, ToolSurface } from '../types.mts'
import { getToolRequiredScopes } from './select.mts'

// MCP Tool shape (mirrors @modelcontextprotocol/sdk Tool type)
export type McpToolShape = {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  _meta?: {
    'voucha/requiredScopes': string[]
  }
}

export function toolToMcpTool(
  tool: Tool,
  surface: Extract<ToolSurface, 'mcp' | 'admin_mcp'> = 'mcp',
): McpToolShape {
  const annotations = tool.meta?.annotations
  const mcpScopes = getToolRequiredScopes(tool, surface)
  return {
    name: tool.schema.name,
    description: tool.schema.description ?? undefined,
    inputSchema: (tool.schema.parameters ?? { type: 'object', properties: {} }) as Record<
      string,
      unknown
    >,
    ...(annotations
      ? {
          annotations: {
            readOnlyHint: annotations.readOnlyHint,
            destructiveHint: annotations.destructiveHint,
            idempotentHint: annotations.idempotentHint,
            openWorldHint: annotations.openWorldHint,
          },
        }
      : {}),
    ...(mcpScopes ? { _meta: { 'voucha/requiredScopes': mcpScopes } } : {}),
  }
}
