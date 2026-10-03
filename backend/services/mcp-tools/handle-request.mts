import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { listMcpToolsForUser } from './list-tools.mts'
import { callMcpTool } from './call-tool.mts'
import { validateRegisteredMcpRequest } from './validate-registered-request.mts'
import { MCP_SERVER_INSTRUCTIONS } from './instructions.mts'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'
import type { McpHttpResponse } from './http-response.mts'

type McpRequestContext = {
  user: BasicUser & {
    membership_plan: 'plus' | 'pro' | null
  }
  permissions: readonly ApiScope[]
  request: Request
  parsedBody: unknown
  config: McpServerConfig
  // Awaited after an admitted tool call returns an error result, so the caller can record it.
  onToolError?: (toolName: string) => Promise<void>
}

export async function handleMcpHttpRequest(ctx: McpRequestContext): Promise<McpHttpResponse> {
  const invalidRequestResponse = validateRegisteredMcpRequest(ctx.parsedBody)
  if (invalidRequestResponse) return invalidRequestResponse

  const server = new Server(
    { name: ctx.config.serverName, version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: MCP_SERVER_INSTRUCTIONS[ctx.config.surface] },
  )

  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = listMcpToolsForUser(ctx.user, ctx.permissions, ctx.config)
    return Promise.resolve({ tools })
  })

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const result = await callMcpTool(
      request.params.name,
      request.params.arguments ?? {},
      ctx.user,
      ctx.permissions,
      ctx.config,
    )
    if (result.isError) await ctx.onToolError?.(request.params.name)
    return result
  })

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    const response = await transport.handleRequest(ctx.request, { parsedBody: ctx.parsedBody })
    return response ?? new Response(null, { status: 202 })
  } finally {
    await transport.close()
    await server.close()
  }
}
