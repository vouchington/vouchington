import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { ADMIN_MCP_SERVER_CONFIG } from '@services/mcp-tools'
import { dispatchMcpRequest, rejectMcpMethod } from '../../mcp-helpers.mts'
import { apiRequestContract } from '../../response-contract.mts'

// POST /api/v1/admin/mcp — administrator-only MCP Streamable HTTP endpoint.
// Auth: an admin-resource OAuth access token or an admin MCP API key, plus the administrator role.
app.route('/api/v1/admin/mcp').post(async (ctx: Context) => {
  // JSON-RPC messages are validated by the MCP SDK, so the contract body stays open.
  apiRequestContract<'POST:/api/v1/admin/mcp', unknown>('POST:/api/v1/admin/mcp')
  const response = await dispatchMcpRequest(ctx, ADMIN_MCP_SERVER_CONFIG)
  const contentType = response.headers.get('Content-Type')
  if (contentType) ctx.setType(contentType)
  ctx.setStatus(response.status)
  if (!response.body) ctx.response.empty()
  else await ctx.pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>))
})
app.route('/api/v1/admin/mcp').get(rejectMcpMethod)
app.route('/api/v1/admin/mcp').delete(rejectMcpMethod)
