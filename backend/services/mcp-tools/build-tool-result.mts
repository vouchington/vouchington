import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ToolOutputSchema } from '@services/openai-agents/tool-types'
import { findSchemaViolation } from '@voucha/tools/schema-validator'
import {
  MAX_MCP_TOOL_RESULT_BYTES,
  McpToolResultTooLargeError,
  serializeMcpToolResult,
} from './serialize-mcp-tool-result.mts'

// A tool that declares an output schema returned something its own schema rejects. That is a
// server bug, not something the caller can fix, so it is reported and the caller sees a generic
// failure. The message carries the tool and the rule that failed, never the offending value.
export class McpToolOutputMismatchError extends Error {
  override readonly name = 'McpToolOutputMismatchError'
}

/**
 * The MCP result for a tool's return value.
 *
 * A tool without an output schema returns its JSON as one text block. A tool with one also
 * returns that same JSON as `structuredContent`, after checking it against the published schema,
 * so a client is never handed structured content that breaks the contract it was promised.
 *
 * Either way the assembled response, not the raw JSON, is held to the response bound, because the
 * JSON escaping inside a text block makes it larger than the JSON it carries.
 */
export function buildToolResult(
  toolName: string,
  result: unknown,
  outputSchema: ToolOutputSchema | undefined,
): CallToolResult {
  const response = outputSchema
    ? buildStructuredResponse(toolName, result, outputSchema)
    : { content: [{ type: 'text' as const, text: serializeMcpToolResult(result) }] }
  if (Buffer.byteLength(JSON.stringify(response), 'utf8') > MAX_MCP_TOOL_RESULT_BYTES) {
    throw new McpToolResultTooLargeError('Tool response exceeds the MCP response limit')
  }
  return response
}

function buildStructuredResponse(
  toolName: string,
  result: unknown,
  outputSchema: ToolOutputSchema,
): CallToolResult {
  // The JSON goes out twice, and the escaped text copy is never smaller than the JSON itself, so
  // a result over half the bound cannot fit. Rejecting it here skips the parse and validation.
  const text = serializeMcpToolResult(result, MAX_MCP_TOOL_RESULT_BYTES / 2)
  const structuredContent = JSON.parse(text) as Record<string, unknown>
  const violation = findSchemaViolation(outputSchema, structuredContent)
  if (violation) {
    throw new McpToolOutputMismatchError(
      `${toolName} returned a result that does not match its output schema: ${violation}`,
    )
  }
  return { content: [{ type: 'text', text }], structuredContent }
}
