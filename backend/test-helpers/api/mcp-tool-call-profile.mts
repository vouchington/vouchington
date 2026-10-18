import { profileMcpToolCall, splitMcpToolCallProfiles } from './request-query-profile.mts'

type CallMcpTool = (toolName: string, ...rest: unknown[]) => Promise<unknown>
type HandleMcpHttpRequest = (ctx: { parsedBody: unknown }) => Promise<unknown>

/** Wraps `callMcpTool` so each tool call of a split batch request gets its own query profile. */
export function withToolCallProfile(actual: CallMcpTool): CallMcpTool {
  return (toolName, ...rest) => profileMcpToolCall(toolName, () => actual(toolName, ...rest))
}

/** Wraps `handleMcpHttpRequest` so a request carrying several tool calls is marked for splitting. */
export function withBatchRequestMarker(actual: HandleMcpHttpRequest): HandleMcpHttpRequest {
  return ctx => {
    const messages = Array.isArray(ctx.parsedBody) ? ctx.parsedBody : [ctx.parsedBody]
    const toolCalls = messages.filter(
      message => (message as { method?: unknown } | null)?.method === 'tools/call',
    )
    if (toolCalls.length > 1) splitMcpToolCallProfiles()
    return actual(ctx)
  }
}
