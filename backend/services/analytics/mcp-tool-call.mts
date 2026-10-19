import { emit, type AnalyticsBaseRecord, type McpToolCallRecord } from '@data-stores/analytics'

/** The dimensions of one settled MCP message, before the shared event envelope is added. */
export type McpToolCall = Omit<McpToolCallRecord, keyof AnalyticsBaseRecord>

export type McpToolCallContext = {
  audience: McpToolCallRecord['audience']
  credential: McpToolCallRecord['credential']
  userId: string
  apiKeyId: string | null
  oauthClientId: string | null
  oauthGrantId: string | null
  plan: McpToolCallRecord['plan']
}

export type McpToolCallPlanEvent = {
  jsonrpcMethod: string | null
  toolName: string | null
  option?: string
  outcome: McpToolCallRecord['outcome']
}

export type McpToolCallDispatch = {
  isDispatched: (message: unknown) => boolean
  isNotification: (message: unknown) => boolean
}

export type McpToolCallSettlement = {
  durationMs: number | null
  toolError: boolean
  rateLimited: boolean
}

export type McpToolCallAnalytics = {
  requestEventId: string
  recordCalls: (
    events: readonly McpToolCallPlanEvent[],
    messages: readonly unknown[],
    deferDispatched: boolean,
  ) => void
  settleDispatchedCall: (messageIndex: number, settlement: McpToolCallSettlement) => void
}

// Every dimension is named rather than spread, so a caller that forwards arguments, a result, or a
// bearer credential still cannot widen the row that reaches the analytics pipeline.
export function trackMcpToolCall(call: McpToolCall): void {
  const now = new Date()
  emit('mcp_tool_call', {
    event_id: crypto.randomUUID(),
    event_time: now,
    event_date: now.toISOString().slice(0, 10),
    env: process.env.NODE_ENV ?? 'development',
    audience: call.audience,
    credential: call.credential,
    user_id: call.user_id,
    api_key_id: call.api_key_id,
    oauth_client_id: call.oauth_client_id,
    oauth_grant_id: call.oauth_grant_id,
    plan: call.plan,
    request_event_id: call.request_event_id,
    batch_size: call.batch_size,
    batch_index: call.batch_index,
    tool: call.tool,
    option: call.option,
    jsonrpc_method: call.jsonrpc_method,
    outcome: call.outcome,
    duration_ms: call.duration_ms,
  })
}

// One analytics event per settled message. Calls the server will run stay pending until the handler
// reports the final outcome; a notification-shaped tools/call is dropped.
export function createMcpToolCallAnalytics(
  context: McpToolCallContext,
  dispatch: McpToolCallDispatch,
): McpToolCallAnalytics {
  const requestEventId = crypto.randomUUID()
  const pending = new Map<number, McpToolCallPlanEvent>()
  let batchSize = 0

  return {
    requestEventId,
    recordCalls(events, messages, deferDispatched) {
      batchSize = events.length
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index]
        if (event === undefined) continue
        const message = messages[index]
        if (message !== undefined && dispatch.isNotification(message)) continue
        if (deferDispatched && message !== undefined && dispatch.isDispatched(message)) {
          pending.set(index, event)
          continue
        }
        emitSettled(context, requestEventId, events.length, index, event, null)
      }
    },
    settleDispatchedCall(messageIndex, settlement) {
      const event = pending.get(messageIndex)
      if (event === undefined) return
      pending.delete(messageIndex)
      emitSettled(
        context,
        requestEventId,
        batchSize,
        messageIndex,
        { ...event, outcome: finalOutcome(event.outcome, settlement) },
        settlement.durationMs,
      )
    },
  }
}

function finalOutcome(
  planned: McpToolCallRecord['outcome'],
  settlement: McpToolCallSettlement,
): McpToolCallRecord['outcome'] {
  if (settlement.rateLimited) return 'rate_limited'
  if (settlement.toolError) return 'tool_error'
  return planned
}

function emitSettled(
  context: McpToolCallContext,
  requestEventId: string,
  batchSize: number,
  batchIndex: number,
  event: McpToolCallPlanEvent,
  durationMs: number | null,
): void {
  trackMcpToolCall({
    audience: context.audience,
    credential: context.credential,
    user_id: context.userId,
    api_key_id: context.apiKeyId,
    oauth_client_id: context.oauthClientId,
    oauth_grant_id: context.oauthGrantId,
    plan: context.plan,
    request_event_id: requestEventId,
    batch_size: batchSize,
    batch_index: batchIndex,
    tool: event.toolName,
    option: event.option ?? null,
    jsonrpc_method: event.jsonrpcMethod,
    outcome: event.outcome,
    duration_ms: durationMs,
  })
}
