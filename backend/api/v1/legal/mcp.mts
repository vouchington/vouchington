import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { LEGAL_MCP_SERVER_CONFIG } from '@services/mcp-tools'
import { dispatchMcpRequest, rejectMcpMethod } from '../../mcp-helpers.mts'
import {
  apiOpenApiHttpResponse,
  apiRequestContract,
} from '@vouchington/utils/api-response-contract'

// Legal casework requires an administrator and a legal-resource OAuth token; API keys are refused.
app.route('/api/v1/legal/mcp').post(async (ctx: Context) => {
  apiRequestContract<'POST:/api/v1/legal/mcp', unknown>('POST:/api/v1/legal/mcp')
  const response = apiOpenApiHttpResponse(
    'POST:/api/v1/legal/mcp',
    await dispatchMcpRequest(ctx, LEGAL_MCP_SERVER_CONFIG.audience),
  )
  const contentType = response.headers.get('Content-Type')
  if (contentType) ctx.setType(contentType)
  ctx.setStatus(response.status)
  if (!response.body) ctx.response.empty()
  else await ctx.pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>))
})
app.route('/api/v1/legal/mcp').get(rejectMcpMethod)
app.route('/api/v1/legal/mcp').delete(rejectMcpMethod)
