import app from '../../app.mts'
import { Readable } from 'node:stream'
import type { Context } from '@jongleberry/api-server'
import { validateApiKey } from '@services/api-keys/validate'
import { getPrivateUserByAny, isAdminUser } from '@services/users'
import { checkRouteRateLimit } from '@services/route-rate-limits'
import {
  ADMIN_MCP_SERVER_CONFIG,
  buildMcpContextUser,
  handleMcpHttpRequest,
} from '@services/mcp-tools'
import createHttpError from 'http-errors'

// POST /api/v1/admin/mcp — administrator-only MCP Streamable HTTP endpoint.
// Auth: Bearer voucha_mcp_... API key with admin MCP read permission.
app.route('/api/v1/admin/mcp').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const rawAuthHeader = ctx.req.headers.authorization
  const authHeader = Array.isArray(rawAuthHeader) ? (rawAuthHeader[0] ?? '') : (rawAuthHeader ?? '')
  const rawKey = authHeader.slice(0, 7).toLowerCase() === 'bearer ' ? authHeader.slice(7) : ''
  ctx.assert(rawKey, 401, 'Authorization: Bearer <mcp-api-key> required')

  const { valid, apiKey } = await validateApiKey(rawKey, ADMIN_MCP_SERVER_CONFIG.readPermission)
  if (!valid || !apiKey) throw createHttpError(401, 'Invalid or revoked API key')

  const owner = await getPrivateUserByAny(apiKey.user_id)
  if (!owner) throw createHttpError(401, 'API key owner not found')
  if (owner.suspended_at) throw createHttpError(403, 'Account is suspended')
  if (!isAdminUser(owner)) throw createHttpError(403, 'Administrator role required')

  const rateLimitResult = await checkRouteRateLimit(
    'POST:/api/v1/admin/mcp',
    { ip: ctx.ip, apiKeyId: apiKey.id },
    owner,
  )
  if (rateLimitResult.limited) {
    ctx.set('Retry-After', String(rateLimitResult.retryAfterSeconds ?? 60))
    throw createHttpError(429, 'Rate limit exceeded')
  }

  const parsedBody = await ctx.request.json('1mb')

  const webRequest = new Request(`http://localhost${ADMIN_MCP_SERVER_CONFIG.routePath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(parsedBody),
  })

  const response = await handleMcpHttpRequest({
    user: buildMcpContextUser(owner),
    permissions: apiKey.permissions,
    request: webRequest,
    parsedBody,
    config: ADMIN_MCP_SERVER_CONFIG,
  })

  const contentType = response.headers.get('Content-Type')
  if (contentType) ctx.setType(contentType)
  if (response.status === 204 || response.status === 205) {
    await response.body?.cancel()
    ctx.setStatus(response.status)
    return
  }
  ctx.setStatus(response.status)
  if (!response.body) {
    ctx.response.empty()
  } else {
    await ctx.pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>))
  }
})

app.route('/api/v1/admin/mcp').get((ctx: Context) => {
  ctx.set('Allow', 'POST')
  ctx.throw(405, 'Method Not Allowed')
})

app.route('/api/v1/admin/mcp').delete((ctx: Context) => {
  ctx.set('Allow', 'POST')
  ctx.throw(405, 'Method Not Allowed')
})
