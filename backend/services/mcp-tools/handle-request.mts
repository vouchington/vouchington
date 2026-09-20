import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { listMcpToolsForUser } from './list-tools.mts'
import { callMcpTool } from './call-tool.mts'
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

function validateRegisteredMcpRequest(parsedBody: unknown): Response | null {
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return null

  const request = parsedBody as Record<string, unknown>
  const schema =
    request.method === 'tools/list'
      ? ListToolsRequestSchema
      : request.method === 'tools/call'
        ? CallToolRequestSchema
        : null
  if (!schema || schema.safeParse(parsedBody).success) return null

  const id = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : null
  return Response.json(
    {
      jsonrpc: '2.0',
      id,
      error: { code: ErrorCode.InvalidRequest, message: 'Invalid request' },
    },
    { status: 200 },
  )
}
