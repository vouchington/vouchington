import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { BRAND_MCP_SERVER_CONFIG } from '@services/mcp-tools'
import { dispatchMcpRequest, rejectMcpMethod } from '../../mcp-helpers.mts'
import {
  apiOpenApiHttpResponse,
  apiRequestContract,
} from '@vouchington/utils/api-response-contract'

// Brand callers authenticate with a resource-bound OAuth token or MCP API key.
app.route('/api/v1/brand/mcp').post(async (ctx: Context) => {
  apiRequestContract<'POST:/api/v1/brand/mcp', unknown>('POST:/api/v1/brand/mcp')
  const response = apiOpenApiHttpResponse(
    'POST:/api/v1/brand/mcp',
    await dispatchMcpRequest(ctx, BRAND_MCP_SERVER_CONFIG.audience),
  )
  const contentType = response.headers.get('Content-Type')
  if (contentType) ctx.setType(contentType)
  ctx.setStatus(response.status)
  if (!response.body) ctx.response.empty()
  else await ctx.pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>))
})
app.route('/api/v1/brand/mcp').get(rejectMcpMethod)
app.route('/api/v1/brand/mcp').delete(rejectMcpMethod)
