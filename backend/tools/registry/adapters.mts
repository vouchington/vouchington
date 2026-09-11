import type { Tool } from '../types.mts'

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
}

export function toolToMcpTool(tool: Tool): McpToolShape {
  const annotations = tool.meta?.annotations
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
  }
}
