import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { authorizeDbscProof, parseDbscString } from '@services/jwt-session/dbsc-proof'
import { createDbscRefreshChallenge } from '@services/jwt-session/dbsc-registration'
import { refreshSessionState } from '@services/jwt-session'
import { getPrivateUserByAny } from '@services/users/get'
import { setAuthenticationCookies } from '@modules/api-utils'
import { dbscSessionInstructions, getDbscOrigin } from './dbsc-registration-helpers.mts'

app.route('/api/v1/auth/device-bound-sessions').post(async (ctx: Context) => {
  await requireAuth(ctx, 'POST:/api/v1/auth/device-bound-sessions')
  validateRequestContract(ctx, 'POST:/api/v1/auth/device-bound-sessions', {})
  const origin = getDbscOrigin(ctx)
  ctx.assert(origin, 401, 'Device session registration unavailable')
  const deviceToken = ctx.cookies.get('dt')
  ctx.assert(deviceToken, 401, 'Unauthorized')
  const header = ctx.req.headers['secure-session-response']
  ctx.assert(typeof header === 'string', 400, 'Device session proof required')
  const proof = await authorizeDbscProof({
    purpose: 'registration',
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    origin,
    proofHeader: header,
    fetchUser: getPrivateUserByAny,
  })
  const refreshed = await refreshSessionState({
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    fetchUser: getPrivateUserByAny,
    dbscProof: proof,
    verifyRevocationOnHotPath: true,
  })
  setAuthenticationCookies(ctx, refreshed)
  ctx.set('Cache-Control', 'no-store')
  ctx.json(dbscSessionInstructions(proof.sid, origin))
})

app.route('/api/v1/auth/device-bound-sessions/refreshes').post(async (ctx: Context) => {
  // Browser-managed refresh intentionally has no live access cookie; dt and proof are checked below.
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/device-bound-sessions/refreshes')
  validateRequestContract(ctx, 'POST:/api/v1/auth/device-bound-sessions/refreshes', {})
  const origin = getDbscOrigin(ctx)
  ctx.assert(origin, 401, 'Device session refresh unavailable')
  const deviceToken = ctx.cookies.get('dt')
  ctx.assert(deviceToken, 401, 'Unauthorized')
  const sessionHeader = ctx.req.headers['sec-secure-session-id']
  const sessionId = parseDbscString(typeof sessionHeader === 'string' ? sessionHeader : undefined)
  ctx.assert(sessionId, 400, 'Device session identifier required')
  const header = ctx.req.headers['secure-session-response']
  if (typeof header !== 'string') {
    const nonce = await createDbscRefreshChallenge({
      deviceToken,
      userAgent: ctx.req.headers['user-agent'],
      origin,
      sessionId,
    })
    ctx.assert(nonce, 401, 'Device session refresh unavailable')
    ctx.setStatus(403)
    ctx.set('Cache-Control', 'no-store')
    ctx.set('Secure-Session-Challenge', `"${nonce}";id="${sessionId}"`)
    ctx.json({ code: 'DBSC_PROOF_REQUIRED' })
    return
  }
  const proof = await authorizeDbscProof({
    purpose: 'refresh',
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    origin,
    proofHeader: header,
    sessionHeader: typeof sessionHeader === 'string' ? sessionHeader : undefined,
    fetchUser: getPrivateUserByAny,
  })
  const refreshed = await refreshSessionState({
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    fetchUser: getPrivateUserByAny,
    dbscProof: proof,
    verifyRevocationOnHotPath: true,
  })
  setAuthenticationCookies(ctx, refreshed)
  ctx.set('Cache-Control', 'no-store')
  ctx.json(dbscSessionInstructions(proof.sid, origin))
})
