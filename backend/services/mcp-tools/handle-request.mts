import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { listMcpToolsForUser } from './list-tools.mts'
import { callMcpTool } from './call-tool.mts'
import { validateRegisteredMcpRequest } from './validate-registered-request.mts'
import type { BasicUser } from '@services/users/types'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'

type McpRequestContext = {
  user: BasicUser & {
    membership_plan: 'plus' | 'pro' | null
  }
  permissions: readonly ApiScope[]
  request: Request
  parsedBody: unknown
  config: McpServerConfig
}

export async function handleMcpHttpRequest(ctx: McpRequestContext): Promise<Response> {
  const invalidRequestResponse = validateRegisteredMcpRequest(ctx.parsedBody)
  if (invalidRequestResponse) return invalidRequestResponse

  const server = new Server(
    { name: ctx.config.serverName, version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = listMcpToolsForUser(ctx.user, ctx.permissions, ctx.config)
    return Promise.resolve({ tools })
  })

  server.setRequestHandler(CallToolRequestSchema, request =>
    callMcpTool(
      request.params.name,
      request.params.arguments ?? {},
      ctx.user,
      ctx.permissions,
      ctx.config,
    ),
  )

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
