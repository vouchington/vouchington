import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { RATE_LIMIT } from '@modules/on-error/error-codes'

// The in-band refusal of a call whose REST route bucket is spent. It has the shape of the 4xx
// results `callMcpTool` returns, so a client reads `retryAfterSeconds` the way it would read the
// `Retry-After` header of the REST 429.
export function buildRateLimitedToolResult(retryAfterSeconds: number): CallToolResult {
  const error = {
    status: 429,
    code: RATE_LIMIT,
    message: 'Rate limit exceeded. Please try again later.',
    retryable: true,
    ...(Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
  }
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error }) }] }
}
