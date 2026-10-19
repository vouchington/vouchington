import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

function requestId(message: unknown): string | number | null {
  const { id } = message as { id?: unknown }
  return typeof id === 'string' || (typeof id === 'number' && Number.isInteger(id)) ? id : null
}

export function mcpToolCallIsDispatched(message: unknown): boolean {
  return CallToolRequestSchema.safeParse(message).success && requestId(message) !== null
}

// A tools/call without a JSON-RPC id is a notification. The server never runs it.
export function mcpNotificationShapedToolCall(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false
  const { method, id } = message as { method?: unknown; id?: unknown }
  return method === 'tools/call' && (id === undefined || id === null)
}
