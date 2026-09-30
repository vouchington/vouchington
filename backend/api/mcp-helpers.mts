import type { Context } from '@jongleberry/api-server'
import { hasScopeAudience, withScopePrerequisites } from '@modules/scopes'
import {
  authenticateMcpBearer,
  buildMcpBearerChallenge,
  buildMcpContextUser,
  classifyMcpCalls,
  exceedsMcpAuditBatchLimit,
  findMcpStepUpScopes,
  handleMcpHttpRequest,
  type McpServerConfig,
} from '@services/mcp-tools'
import { checkRouteRateLimit } from '@services/route-rate-limits'
import { isAdminUser } from '@services/users'
import { startMcpRequestAudit, unreadMcpCall } from './mcp-audit-helpers.mts'

// Stateless MCP Streamable HTTP for both MCP routes. The bearer credential (an OAuth access token,
// or a user MCP API key on the user route only) is the identity, so session cookies are never read.
// Each route emits the returned response itself: OpenAPI discovery only attributes an emission to a
// route when it sits in that route's own handler, not in a helper both routes share.
//
// The admin route audits every call of a verified OAuth principal before the call runs: each
// rejection below and each admitted message writes its own row, all sharing one correlation id.
export async function dispatchMcpRequest(ctx: Context, config: McpServerConfig): Promise<Response> {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const authentication = await authenticateMcpBearer(ctx.req.headers.authorization, config)
  if (authentication.status !== 'authenticated') {
    const error = authentication.status === 'missing' ? 'missing_credential' : 'invalid_token'
    ctx.set('WWW-Authenticate', buildMcpBearerChallenge(config, { error }))
    ctx.throw(401, 'Unauthorized')
  }
  const { owner, scopes } = authentication
  const audit = startMcpRequestAudit(ctx, config, {
    ownerId: owner.id,
    oauthClientId: authentication.oauthClientId,
  })
  if (config.audience === 'admin' && !isAdminUser(owner)) {
    await audit?.record([unreadMcpCall('role_denied')])
    ctx.throw(403, 'Administrator role required')
  }
  if (config.audience === 'admin' && !hasScopeAudience(scopes, 'admin')) {
    await audit?.record([unreadMcpCall('insufficient_scope')])
    ctx.set(
      'WWW-Authenticate',
      buildMcpBearerChallenge(config, {
        error: 'insufficient_scope',
        scopes: withScopePrerequisites(['mcp.admin:read']),
      }),
    )
    ctx.throw(403, 'Insufficient scope')
  }

  const rateLimitResult = await checkRouteRateLimit(
    `POST:${config.routePath}`,
    { ip: ctx.ip, ...authentication.rateLimitIdentity },
    owner,
  )
  if (rateLimitResult.limited) {
    await audit?.record([unreadMcpCall('rate_limited')])
    ctx.set('Retry-After', String(rateLimitResult.retryAfterSeconds))
    ctx.throw(429, 'Rate limit exceeded')
  }

  const parsedBody = await readBody(ctx, audit)
  const user = buildMcpContextUser(owner)
  if (audit) {
    if (exceedsMcpAuditBatchLimit(parsedBody)) {
      await audit.record([unreadMcpCall('invalid_request')])
      ctx.throw(413, 'Too many JSON-RPC messages')
    }
    await audit.record(classifyMcpCalls(parsedBody, user, scopes, config))
  }
  // Only OAuth clients can step up, so an API key keeps the in-band JSON-RPC scope error.
  if (authentication.credential === 'oauth') {
    const stepUpScopes = findMcpStepUpScopes(parsedBody, user, scopes, config)
    if (stepUpScopes) {
      ctx.set(
        'WWW-Authenticate',
        buildMcpBearerChallenge(config, { error: 'insufficient_scope', scopes: stepUpScopes }),
      )
      ctx.throw(403, 'Insufficient scope')
    }
  }

  return handleMcpHttpRequest({
    user,
    permissions: scopes,
    request: new Request(`http://localhost${config.routePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(parsedBody),
    }),
    parsedBody,
    config,
    ...(audit ? { onToolError: audit.recordToolError } : {}),
  })
}

// An unreadable or oversized body is still a call from a verified principal, so it is audited
// before its own error goes back.
async function readBody(
  ctx: Context,
  audit: ReturnType<typeof startMcpRequestAudit>,
): Promise<unknown> {
  try {
    return await ctx.request.json('1mb')
  } catch (error) {
    await audit?.record([unreadMcpCall('invalid_request')])
    throw error
  }
}

export function rejectMcpMethod(ctx: Context): never {
  ctx.set('Allow', 'POST')
  ctx.throw(405, 'Method Not Allowed')
}
