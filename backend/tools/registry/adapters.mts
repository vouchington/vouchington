import type { Tool, ToolAnnotations, ToolSurface } from '../types.mts'
import { getToolRequiredScopes } from './select.mts'

export type McpToolAnnotations = {
  readOnlyHint: boolean
  destructiveHint?: boolean
  idempotentHint: boolean
  openWorldHint?: boolean
}

// MCP Tool shape (mirrors @modelcontextprotocol/sdk Tool type)
export type McpToolShape = {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: McpToolAnnotations
  _meta?: {
    'voucha/requiredScopes': string[]
  }
}

// A read never changes state, so repeating it is always safe.
export function toMcpToolAnnotations(annotations: ToolAnnotations): McpToolAnnotations {
  return annotations.readOnlyHint ? { ...annotations, idempotentHint: true } : annotations
}

export function toolToMcpTool(
  tool: Tool,
  surface: Extract<ToolSurface, 'mcp' | 'admin_mcp'> = 'mcp',
): McpToolShape {
  const mcpScopes = getToolRequiredScopes(tool, surface)
  return {
    name: tool.schema.name,
    ...(tool.meta ? { title: tool.meta.title } : {}),
    description: tool.schema.description ?? undefined,
    inputSchema: (tool.schema.parameters ?? { type: 'object', properties: {} }) as Record<
      string,
      unknown
    >,
    ...(tool.meta ? { annotations: toMcpToolAnnotations(tool.meta.annotations) } : {}),
    ...(mcpScopes ? { _meta: { 'voucha/requiredScopes': mcpScopes } } : {}),
  }
}
