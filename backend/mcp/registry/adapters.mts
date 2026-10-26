import type {
  Tool,
  ToolMeta,
  ToolAnnotations,
  ToolOutputSchema,
} from '@services/openai-agents/tool-types'
import { getToolRequiredScopes } from './select.mts'
import {
  validateOptionOutputPointers,
  closeDeclaredInputObjects,
  factorToolSchema,
} from '@vouchington/mcp-server/schema'

type McpToolAnnotations = {
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
  inputSchema: { type: 'object'; [keyword: string]: unknown }
  outputSchema?: ToolOutputSchema
  annotations?: McpToolAnnotations
  _meta?: {
    'voucha/requiredScopes': string[]
    'voucha/optionOutputPointers'?: Readonly<Record<string, string>>
  }
}

// A read never changes state, so repeating it is always safe.
export function toMcpToolAnnotations(annotations: ToolAnnotations): McpToolAnnotations {
  return annotations.readOnlyHint ? { ...annotations, idempotentHint: true } : annotations
}

export function toolToMcpTool(
  tool: Tool,
  audience: NonNullable<ToolMeta['audience']> = 'user',
): McpToolShape {
  const mcpScopes = getToolRequiredScopes(tool, audience)
  const inputSchema = {
    ...factorToolSchema(
      closeDeclaredInputObjects(tool.schema.parameters ?? { type: 'object', properties: {} }),
    ),
    type: 'object' as const,
  }
  const outputSchema = tool.meta?.outputSchema
    ? (factorToolSchema(tool.meta.outputSchema) as ToolOutputSchema)
    : undefined
  const optionOutputPointers =
    audience === 'user' || audience === 'community_moderation'
      ? tool.meta?.optionOutputPointers
      : undefined
  if (optionOutputPointers)
    validateOptionOutputPointers(tool.schema.name, inputSchema, outputSchema, optionOutputPointers)
  return {
    name: tool.schema.name,
    ...(tool.meta ? { title: tool.meta.title } : {}),
    description: tool.schema.description ?? undefined,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    ...(tool.meta ? { annotations: toMcpToolAnnotations(tool.meta.annotations) } : {}),
    ...(mcpScopes || optionOutputPointers
      ? {
          _meta: {
            'voucha/requiredScopes': mcpScopes ?? [],
            ...(optionOutputPointers
              ? { 'voucha/optionOutputPointers': optionOutputPointers }
              : {}),
          },
        }
      : {}),
  }
}
