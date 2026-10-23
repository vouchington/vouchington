import app from '../app.mts'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import createHttpError from 'http-errors'
import { requireAuth, validateRequestContract } from '../response-helpers.mts'
import { assertNativeRequest } from '../v1/sessions-authentication/native-request.mts'
import {
  hasAttestationKeyForDevice,
  isUnattestedNativeMcpMintAllowed,
  verifyRequestSignature,
  ATTESTED_BODY_LIMIT,
} from '@services/app-attestation'
import {
  mintNativeSessionMcpToken,
  NATIVE_OAUTH_CLIENT_APPS,
  type NativeOAuthClientApp,
} from '@services/oauth-authorization-server'
import type { Context } from '@jongleberry/api-server'

const ROUTE = 'POST:/api/v1/oauth/native-session-tokens'
const mintRateLimiter = new RateLimiter({ prefix: 'native-session-mcp-mint', ttlSeconds: 60 })

app.route('/api/v1/oauth/native-session-tokens').post(async (ctx: Context) => {
  assertNativeRequest(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  ctx.assert(
    ctx.req.headers['x-voucha-native-mcp-mint'] === '1',
    403,
    'Native MCP mint header required',
  )
  const currentUser = await requireAuth(ctx, ROUTE)
  const session = await ctx.getSessionTokenData()
  ctx.assert(session.uid === currentUser.id, 401, 'Unauthorized')
  const userLimit = await mintRateLimiter.addAndCheck([`user:${currentUser.id}`], 30)
  const sessionLimit = await mintRateLimiter.addAndCheck([`session:${session.sid}`], 10)
  if (userLimit.limited || sessionLimit.limited)
    throw createHttpError(429, 'Too many token requests')

  const hasKey = await hasAttestationKeyForDevice(session.did)
  let attestationStatus: 'attested' | 'unattested'
  if (hasKey) {
    if (!ctx.hasVerifiedRequestSignature()) {
      const header = (name: string): string => {
        const value = ctx.req.headers[name]
        return typeof value === 'string' ? value : ''
      }
      const keyId = header('x-app-attest-key-id')
      const assertion = header('x-app-attest-assertion')
      const timestamp = header('x-app-attest-timestamp')
      const nonce = header('x-app-attest-nonce')
      ctx.assert(
        keyId && assertion && timestamp && nonce,
        403,
        'App Attest request signature required',
      )
      await verifyRequestSignature({
        method: 'POST',
        path: '/api/v1/oauth/native-session-tokens',
        body: (await ctx.request.buffer(ATTESTED_BODY_LIMIT)) ?? Buffer.alloc(0),
        keyId,
        assertion,
        timestamp,
        nonce,
        did: session.did,
      })
    }
    attestationStatus = 'attested'
  } else {
    ctx.assert(isUnattestedNativeMcpMintAllowed(), 403, 'Unattested native MCP mint disabled')
    attestationStatus = 'unattested'
  }

  const body = (await ctx.request.json('1mb')) as { client_app?: unknown }
  validateRequestContract(ctx, ROUTE, { body })
  ctx.assert(
    typeof body.client_app === 'string' &&
      NATIVE_OAUTH_CLIENT_APPS.includes(body.client_app as NativeOAuthClientApp),
    422,
    'Invalid native client app',
  )
  const result = await mintNativeSessionMcpToken(currentUser.id, {
    did: session.did,
    sid: session.sid,
    clientApp: body.client_app as NativeOAuthClientApp,
    attestationStatus,
  })
  ctx.set('Cache-Control', 'no-store')
  ctx.json(result)
})
