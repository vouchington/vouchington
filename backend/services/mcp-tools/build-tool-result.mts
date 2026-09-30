import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ToolOutputSchema } from '@voucha/tools/types'
import { findSchemaViolation } from './schema-validator.mts'
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
 */
export function buildToolResult(
  toolName: string,
  result: unknown,
  outputSchema: ToolOutputSchema | undefined,
): CallToolResult {
  if (!outputSchema) {
    return { content: [{ type: 'text', text: serializeMcpToolResult(result) }] }
  }

  // The JSON goes out twice, and the escaped text copy is never smaller than the JSON itself, so
  // a result over half the bound cannot fit. The exact check below settles everything else.
  const text = serializeMcpToolResult(result, MAX_MCP_TOOL_RESULT_BYTES / 2)
  const structuredContent = JSON.parse(text) as Record<string, unknown>
  const violation = findSchemaViolation(outputSchema, structuredContent)
  if (violation) {
    throw new McpToolOutputMismatchError(
      `${toolName} returned a result that does not match its output schema: ${violation}`,
    )
  }

  const response: CallToolResult = { content: [{ type: 'text', text }], structuredContent }
  if (Buffer.byteLength(JSON.stringify(response), 'utf8') > MAX_MCP_TOOL_RESULT_BYTES) {
    throw new McpToolResultTooLargeError('Tool response exceeds the MCP response limit')
  }
  return response
}
