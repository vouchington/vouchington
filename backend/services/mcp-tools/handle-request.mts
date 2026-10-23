import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { resolveMcpToolCall } from './resolve-tool-call.mts'
import { listMcpToolsForUser } from './list-tools.mts'
import { callMcpTool } from './call-tool.mts'
import { mcpToolCallIsDispatched } from './classify-calls.mts'
import { buildRateLimitedToolResult } from './rate-limited-result.mts'
import { validateRegisteredMcpRequest } from './validate-registered-request.mts'
import { MCP_SERVER_INSTRUCTIONS } from './instructions.mts'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'
import type { McpHttpResponse } from './http-response.mts'

type McpRequestContext = {
  copyrightDecisionToolsEnabled?: boolean
  user: BasicUser & {
    membership_plan: 'plus' | 'pro' | null
    suspended?: boolean
  }
  permissions: readonly ApiScope[]
  request: Request
  parsedBody: unknown
  config: McpServerConfig
  // Awaited after an admitted tool call returns an error result, so the caller can record it.
  onToolError?: (toolName: string, option?: string) => Promise<void>
  onToolRateLimited?: (toolName: string, messageIndex: number, option?: string) => Promise<void>
  // Fired once when a dispatched tools/call settles. Analytics only; it must not change the result.
  onToolCallSettled?: (
    messageIndex: number,
    settlement: { durationMs: number | null; toolError: boolean; rateLimited: boolean },
  ) => void
  clientIp?: string
  // The retry delay of each `tools/call` whose REST route bucket was spent, by message index.
  // Those calls are refused in-band without running, and are already audited as rate limited.
  rateLimitedCalls: ReadonlyMap<number, { retryAfterSeconds: number; message?: string }>
}

export async function handleMcpHttpRequest(ctx: McpRequestContext): Promise<McpHttpResponse> {
  const invalidRequestResponse = validateRegisteredMcpRequest(ctx.parsedBody)
  if (invalidRequestResponse) return invalidRequestResponse

  // The SDK dispatches batches in source order. Positions distinguish duplicate ids whose calls
  // can have different route-limit or in-tool outcomes.
  const callIndexesById = new Map<string | number, number[]>()
  const messages = Array.isArray(ctx.parsedBody) ? ctx.parsedBody : [ctx.parsedBody]
  messages.forEach((message, index) => {
    if (!mcpToolCallIsDispatched(message)) return
    const id = (message as { id: string | number }).id
    const indexes = callIndexesById.get(id) ?? []
    indexes.push(index)
    callIndexesById.set(id, indexes)
  })

  const server = new Server(
    { name: ctx.config.serverName, version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: MCP_SERVER_INSTRUCTIONS[ctx.config.audience] },
  )
  const pendingToolCalls = new Set<Promise<unknown>>()

  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = listMcpToolsForUser(
      ctx.user,
      ctx.permissions,
      ctx.config,
      ctx.copyrightDecisionToolsEnabled,
    )
    return Promise.resolve({ tools })
  })

  server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
    const call = (async () => {
      const messageIndex = callIndexesById.get(extra.requestId)?.shift()
      const settle = (settlement: {
        durationMs: number | null
        toolError: boolean
        rateLimited: boolean
      }) => {
        if (messageIndex === undefined) return
        ctx.onToolCallSettled?.(messageIndex, settlement)
      }
      const rateLimit = ctx.rateLimitedCalls.get(messageIndex ?? -1)
      if (rateLimit !== undefined) {
        settle({ durationMs: null, toolError: false, rateLimited: true })
        return buildRateLimitedToolResult(rateLimit.retryAfterSeconds, rateLimit.message)
      }
      const resolution = resolveMcpToolCall(
        request.params.name,
        ctx.user,
        ctx.permissions,
        ctx.config,
        ctx.copyrightDecisionToolsEnabled,
      )
      const option =
        resolution.status === 'allowed'
          ? (resolution.tool.meta?.auditOption?.(request.params.arguments ?? {}) ?? undefined)
          : undefined
      let rateLimited = false
      let durationMs: number | null = null
      try {
        const result = await callMcpTool(
          request.params.name,
          request.params.arguments ?? {},
          ctx.user,
          ctx.permissions,
          ctx.config,
          ctx.copyrightDecisionToolsEnabled,
          {
            ip: ctx.clientIp,
            onInvoked: elapsed => {
              durationMs = elapsed
            },
            onRateLimited: async () => {
              rateLimited = true
              if (messageIndex !== undefined) {
                await ctx.onToolRateLimited?.(request.params.name, messageIndex, option)
              }
            },
          },
        )
        const toolError = result.isError === true && !rateLimited
        settle({ durationMs, toolError, rateLimited })
        if (toolError) await ctx.onToolError?.(request.params.name, option)
        return result
      } catch (err) {
        settle({ durationMs, toolError: false, rateLimited })
        throw err
      }
    })()
    pendingToolCalls.add(call)
    void call.then(
      () => pendingToolCalls.delete(call),
      () => pendingToolCalls.delete(call),
    )
    return call
  })

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    const response = await transport.handleRequest(ctx.request, { parsedBody: ctx.parsedBody })
    // The SDK correlates JSON responses by id and may resolve duplicate-id batches early.
    // Finish all started calls before the outer usage meter settles on response close.
    await Promise.allSettled([...pendingToolCalls])
    return response ?? new Response(null, { status: 202 })
  } finally {
    await transport.close()
    await server.close()
  }
}
