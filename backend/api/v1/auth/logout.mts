import app from '../../app.mts'
import {
  isSessionRevoked,
  runLogoutPushCleanupAndRevoke,
  verifyDeviceAndSessionTokens,
} from '@services/jwt-session'
import { COOKIE_OPTIONS } from '@modules/api-utils'
import onError from '@modules/on-error'
import { deleteExactWebPushSubscription } from '@services/notifications'
import type { Context } from '@jongleberry/api-server'
import { apiRequestContract } from '../../response-contract.mts'
import { readOptionalJsonBody } from './optional-json-body.mts'

type LogoutRequest = {
  web_push_endpoint: string
  web_push_subscription_id: string
}

app.route('/api/v1/auth/logout').post(async ctx => {
  apiRequestContract<'POST:/api/v1/auth/logout', LogoutRequest>('POST:/api/v1/auth/logout')
  const dt = ctx.cookies.get('dt')
  const st = ctx.cookies.get('st')
  const binding = await parseLogoutPushBinding(ctx)

  if (dt && st) {
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: dt,
      sessionToken: st,
    })
    if (verified !== false && verified.uid) {
      const { iat: issuedAt, sid, uid: userId } = verified
      const revoked = await isSessionRevoked(sid, {
        userId,
        issuedAt,
      })
      // Bindings must reach the service so its atomic admission fence can distinguish concurrent
      // pre-revocation cleanup from a later revoked replay.
      if (!revoked || binding) {
        await runLogoutPushCleanupAndRevoke(
          sid,
          { userId, issuedAt },
          binding
            ? () =>
                deleteExactWebPushSubscription(userId, binding).catch(error =>
                  onError(error instanceof Error ? error : new Error(String(error))),
                )
            : async () => {},
          binding,
        )
      }
    }
  }

  ctx.cookies.set('dt', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  ctx.cookies.set('st', '', { ...COOKIE_OPTIONS, maxAge: 0 })

  ctx.setStatus(204)
})

async function parseLogoutPushBinding(ctx: Context) {
  const contentType = ctx.req.headers['content-type']
  const isJson = typeof contentType === 'string' && contentType.includes('application/json')
  if (!isJson) return undefined
  const body = await readOptionalJsonBody(ctx, '20kb')
  if (body === undefined) return undefined
  ctx.assert(
    body && typeof body === 'object' && !Array.isArray(body),
    400,
    'logout request body must be an object',
  )
  const request = body as LogoutRequest
  const endpoint = request.web_push_endpoint
  const subscriptionId = request.web_push_subscription_id
  const hasEndpoint = endpoint !== undefined
  const hasSubscriptionId = subscriptionId !== undefined
  ctx.assert(
    hasEndpoint === hasSubscriptionId,
    400,
    'web push binding must include endpoint and subscription id',
  )
  if (!hasEndpoint) return undefined
  const endpointUrl = typeof endpoint === 'string' ? parseHttpsEndpoint(endpoint) : undefined
  ctx.assert(endpointUrl, 400, 'web_push_endpoint must be a valid HTTPS URL')
  ctx.assert(
    typeof subscriptionId === 'string' && subscriptionId.length > 0,
    400,
    'web_push_subscription_id must be a string',
  )
  ctx.assert(
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(subscriptionId),
    400,
    'web_push_subscription_id must be a UUID',
  )
  return { endpoint: endpointUrl.href, subscriptionId }
}

function parseHttpsEndpoint(value: string): URL | undefined {
  try {
    const endpoint = new URL(value)
    return endpoint.protocol === 'https:' && endpoint.host.length > 0 ? endpoint : undefined
  } catch {
    return undefined
  }
}
