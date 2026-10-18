import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { COMMUNITY_MODERATION_MCP_SERVER_CONFIG } from '@services/mcp-tools'
import { dispatchMcpRequest, rejectMcpMethod } from '../../mcp-helpers.mts'
import { apiOpenApiHttpResponse, apiRequestContract } from '../../response-contract.mts'

// Community moderators and owners authenticate with a resource-bound OAuth token or MCP API key.
app.route('/api/v1/community-moderation/mcp').post(async (ctx: Context) => {
  apiRequestContract<'POST:/api/v1/community-moderation/mcp', unknown>(
    'POST:/api/v1/community-moderation/mcp',
  )
  const response = apiOpenApiHttpResponse(
    'POST:/api/v1/community-moderation/mcp',
    await dispatchMcpRequest(ctx, COMMUNITY_MODERATION_MCP_SERVER_CONFIG.audience),
  )
  const contentType = response.headers.get('Content-Type')
  if (contentType) ctx.setType(contentType)
  ctx.setStatus(response.status)
  if (!response.body) ctx.response.empty()
  else await ctx.pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>))
})
app.route('/api/v1/community-moderation/mcp').get(rejectMcpMethod)
app.route('/api/v1/community-moderation/mcp').delete(rejectMcpMethod)
