import type { Context } from '@jongleberry/api-server'
import {
  runWithCredentialRequestContext,
  type CredentialRequestOrigin,
} from '@modules/request-client-info'
import {
  authenticateMcpBearer,
  buildMcpBearerChallenge,
  buildMcpContextUser,
  findMcpStepUpScopes,
  handleMcpHttpRequest,
  type McpBearerAuthentication,
  type McpServerConfig,
} from '@services/mcp-tools'
import { checkRouteRateLimit } from '@services/route-rate-limits'
import { isAdminUser } from '@services/users'

// Stateless MCP Streamable HTTP for both MCP routes. The bearer credential (an OAuth access token
// or an MCP API key) is the identity, so session cookies are never read. Each route emits the
// returned response itself: OpenAPI discovery only attributes an emission to a route when it sits in
// that route's own handler, not in a helper both routes share.
export async function dispatchMcpRequest(ctx: Context, config: McpServerConfig): Promise<Response> {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const authentication = await authenticateMcpBearer(ctx.req.headers.authorization, config)
  if (authentication.status !== 'authenticated') {
    const error = authentication.status === 'missing' ? 'missing_credential' : 'invalid_token'
    ctx.set('WWW-Authenticate', buildMcpBearerChallenge(config, { error }))
    ctx.throw(401, 'Unauthorized')
  }
  const origin: CredentialRequestOrigin =
    authentication.credential === 'oauth'
      ? {
          interface: 'mcp',
          credential: 'oauth',
          client: null,
          oauthClientId: authentication.oauthClientId,
        }
      : { interface: 'mcp', credential: 'api_key', client: null, oauthClientId: null }
  // Everything after authentication, including tool handlers, runs in the MCP origin so the
  // content they write records the credential's channel and OAuth client.
  return runWithCredentialRequestContext(origin, () =>
    handleAuthenticatedMcpRequest(ctx, config, authentication),
  )
}

async function handleAuthenticatedMcpRequest(
  ctx: Context,
  config: McpServerConfig,
  authentication: Extract<McpBearerAuthentication, { status: 'authenticated' }>,
): Promise<Response> {
  const { owner, scopes } = authentication
  if (config.audience === 'admin' && !isAdminUser(owner)) {
    ctx.throw(403, 'Administrator role required')
  }

  const rateLimitResult = await checkRouteRateLimit(
    `POST:${config.routePath}`,
    { ip: ctx.ip, ...authentication.rateLimitIdentity },
    owner,
  )
  if (rateLimitResult.limited) {
    ctx.set('Retry-After', String(rateLimitResult.retryAfterSeconds))
    ctx.throw(429, 'Rate limit exceeded')
  }

  const parsedBody = await ctx.request.json('1mb')
  const user = buildMcpContextUser(owner)
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
  })
}

export function rejectMcpMethod(ctx: Context): never {
  ctx.set('Allow', 'POST')
  ctx.throw(405, 'Method Not Allowed')
}
