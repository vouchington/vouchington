import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { USER_MCP_SERVER_CONFIG } from '@services/mcp-tools'
import { dispatchMcpRequest, rejectMcpMethod } from '../../mcp-helpers.mts'
import { apiRequestContract } from '../../response-contract.mts'

// POST /api/v1/mcp — Stateless MCP Streamable HTTP endpoint.
// Auth: a user-resource OAuth access token or a user MCP API key; never session cookies.
app.route('/api/v1/mcp').post(async (ctx: Context) => {
  // JSON-RPC messages are validated by the MCP SDK, so the contract body stays open.
  apiRequestContract<'POST:/api/v1/mcp', unknown>('POST:/api/v1/mcp')
  const response = await dispatchMcpRequest(ctx, USER_MCP_SERVER_CONFIG)
  const contentType = response.headers.get('Content-Type')
  if (contentType) ctx.setType(contentType)
  ctx.setStatus(response.status)
  if (!response.body) ctx.response.empty()
  else await ctx.pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>))
})
app.route('/api/v1/mcp').get(rejectMcpMethod)
app.route('/api/v1/mcp').delete(rejectMcpMethod)
