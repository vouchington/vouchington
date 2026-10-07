import { runWithCredentialRequestContext } from '@modules/request-client-info'
import type { Context } from '@jongleberry/api-server'
import { hasScopeAudience, withScopePrerequisites } from '@modules/scopes'
import {
  authenticateMcpBearer,
  buildMcpBearerChallenge,
  buildMcpContextUser,
  exceedsMcpAuditBatchLimit,
  findMcpStepUpScopes,
  handleMcpHttpRequest,
  planMcpCalls,
  type McpServerConfig,
  type McpHttpResponse,
} from '@services/mcp-tools'
import { checkRouteRateLimit } from '@services/route-rate-limits'
import { isAdminUser } from '@services/users'
import { isCopyrightMcpDecisionToolsEnabled } from '@services/copyright-notices/config'
import { startMcpRequestAudit, unreadMcpCall } from './mcp-audit-helpers.mts'
import { chargeMcpToolCalls } from './mcp-route-rate-limit-helpers.mts'
import { startMcpUsageMeter } from './mcp-usage-helpers.mts'

// Stateless MCP Streamable HTTP for both MCP routes. The bearer credential (an OAuth access token,
// or a user MCP API key on the user route only) is the identity, so session cookies are never read.
// Each route emits the returned response itself: OpenAPI discovery only attributes an emission to a
// route when it sits in that route's own handler, not in a helper both routes share.
//
// Each `tools/call` is also charged to the per-route rate-limit bucket of its REST twin, under the
// identities the transport bucket uses, so a user has one budget per route across REST and MCP. A
// call refused there is answered in-band and audited as rate limited; it never runs.
//
// Both routes audit every call of a verified credential (an OAuth access token or, on the user
// route, an API key) before the call runs: each rejection below and each admitted message writes its
// own row, all sharing one correlation id.
export async function dispatchMcpRequest(
  ctx: Context,
  config: McpServerConfig,
): Promise<McpHttpResponse> {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const authentication = await authenticateMcpBearer(ctx.req.headers.authorization, config)
  if (authentication.status !== 'authenticated') {
    const error = authentication.status === 'missing' ? 'missing_credential' : 'invalid_token'
    ctx.set('WWW-Authenticate', buildMcpBearerChallenge(config, { error }))
    ctx.throw(401, 'Unauthorized')
  }
  return runWithCredentialRequestContext(
    authentication.credential === 'oauth'
      ? {
          interface: 'mcp',
          credential: 'oauth',
          client: null,
          oauthClientId: authentication.oauthClientRowId,
        }
      : { interface: 'mcp', credential: 'api_key', client: null, oauthClientId: null },
    async () => {
      const { owner, scopes } = authentication
      const audit = startMcpRequestAudit(ctx, config, {
        ownerId: owner.id,
        credential: authentication,
      })
      // Registered before any rejection below so every outcome of a verified credential is metered.
      const usage = startMcpUsageMeter(ctx, config, authentication)
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

      const rateLimitIdentities = { ip: ctx.ip, ...authentication.rateLimitIdentity }
      const rateLimitResult = await checkRouteRateLimit(
        `POST:${config.routePath}`,
        rateLimitIdentities,
        owner,
      )
      if (rateLimitResult.limited) {
        await audit?.record([unreadMcpCall('rate_limited')])
        ctx.set('Retry-After', String(rateLimitResult.retryAfterSeconds))
        ctx.throw(429, 'Rate limit exceeded')
      }
      // The outcome-based usage quota: it counts the requests the API served, not every attempt.
      const quotaCheck = await usage.checkQuota()
      if (quotaCheck.limited) {
        await audit?.record([unreadMcpCall('rate_limited')])
        ctx.set('Retry-After', String(quotaCheck.retryAfterSeconds))
        ctx.throw(429, 'Usage quota exceeded')
      }

      const parsedBody = await readBody(ctx, audit)
      const user = buildMcpContextUser(owner)
      const copyrightDecisionToolsEnabled =
        config.audience === 'admin' ? await isCopyrightMcpDecisionToolsEnabled() : false
      // Bounds the audit rows and the route charges one request can spend.
      if (exceedsMcpAuditBatchLimit(parsedBody)) {
        await audit?.record([unreadMcpCall('invalid_request')])
        ctx.throw(413, 'Too many JSON-RPC messages')
      }
      const plan = planMcpCalls(parsedBody, user, scopes, config, copyrightDecisionToolsEnabled)
      // Only OAuth clients can step up, so an API key keeps the in-band JSON-RPC scope error. A
      // request that must step up runs nothing, so it is audited but charges no route.
      const stepUpScopes =
        authentication.credential === 'oauth'
          ? findMcpStepUpScopes(parsedBody, user, scopes, config, copyrightDecisionToolsEnabled)
          : null
      const { events, rateLimitedCalls } = await chargeMcpToolCalls(
        stepUpScopes ? { ...plan, charges: [] } : plan,
        { identities: rateLimitIdentities, owner },
      )
      usage.recordPlannedEvents(events)
      await audit?.record(events)
      if (stepUpScopes) {
        ctx.set(
          'WWW-Authenticate',
          buildMcpBearerChallenge(config, { error: 'insufficient_scope', scopes: stepUpScopes }),
        )
        ctx.throw(403, 'Insufficient scope')
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
        copyrightDecisionToolsEnabled,
        clientIp: ctx.ip,
        rateLimitedCalls,
        ...(audit ? { onToolError: audit.recordToolError } : {}),
        onToolRateLimited: async (toolName, messageIndex) => {
          usage.markRateLimited(messageIndex)
          await audit?.recordToolRateLimit(toolName)
        },
      })
    },
  )
}

// An unreadable or oversized body is still a call from a verified principal, so it is audited
// before its own error goes back.
async function readBody(
  ctx: Context,
  audit: ReturnType<typeof startMcpRequestAudit>,
): Promise<unknown> {
  try {
    return await ctx.request.json('1mb')
  } catch (err) {
    await audit?.record([unreadMcpCall('invalid_request')])
    throw err
  }
}

export function rejectMcpMethod(ctx: Context): never {
  ctx.set('Allow', 'POST')
  ctx.throw(405, 'Method Not Allowed')
}
