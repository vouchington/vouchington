import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { validateRequestContract } from '../../response-helpers.mts'
import { authorizeDbscProof, parseDbscSessionId } from '@services/jwt-session/dbsc-proof'
import { createDbscRefreshChallenge } from '@services/jwt-session/dbsc-registration'
import { refreshSessionState } from '@services/jwt-session'
import { DBSC_PROOF_REQUIRED } from '@modules/on-error/error-codes'
import { getPrivateUserByAny } from '@services/users/get'
import { setAuthenticationCookies } from '@modules/api-utils'
import { getTrustedClientJa4 } from '@modules/request-client-info/cloudflare-signals'
import { dbscSessionInstructions, getDbscOrigin } from './dbsc-registration-helpers.mts'

app.route('/api/v1/auth/device-bound-sessions').post(async (ctx: Context) => {
  // Credential completion issued the one-time nonce. DT plus nonce/key proof authorizes
  // registration without an access cookie or a not-yet-created browser session-ID header.
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/device-bound-sessions')
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
    origin,
    requestUrl: new URL(ctx.req.url ?? '/', origin).toString(),
    userAgent: ctx.req.headers['user-agent'],
    ja4: getTrustedClientJa4(ctx.req),
    proofHeader: header,
    fetchUser: userId => getPrivateUserByAny(userId, { readOnly: false }),
  })
  const refreshed = await refreshSessionState({
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    ja4: getTrustedClientJa4(ctx.req),
    fetchUser: userId => getPrivateUserByAny(userId, { readOnly: false }),
    dbscProof: proof,
  })
  setAuthenticationCookies(ctx, refreshed)
  ctx.set('Cache-Control', 'no-store')
  ctx.json(dbscSessionInstructions(proof.sid, origin))
})

app.route('/api/v1/auth/device-bound-sessions/refreshes').post(async (ctx: Context) => {
  await ctx.applyRouteRateLimit('POST:/api/v1/auth/device-bound-sessions/refreshes')
  validateRequestContract(ctx, 'POST:/api/v1/auth/device-bound-sessions/refreshes', {})
  const origin = getDbscOrigin(ctx)
  ctx.assert(origin, 401, 'Device session refresh unavailable')
  const deviceToken = ctx.cookies.get('dt')
  ctx.assert(deviceToken, 401, 'Unauthorized')
  const sessionHeader = ctx.req.headers['sec-secure-session-id']
  const sessionId = parseDbscSessionId(
    typeof sessionHeader === 'string' ? sessionHeader : undefined,
  )
  ctx.assert(sessionId, 400, 'Device session identifier required')
  const header = ctx.req.headers['secure-session-response']
  if (typeof header !== 'string') return requestNewChallenge(ctx, deviceToken, origin, sessionId)
  let proof: Awaited<ReturnType<typeof authorizeDbscProof>>
  try {
    proof = await authorizeDbscProof({
      purpose: 'refresh',
      deviceToken,
      origin,
      requestUrl: new URL(ctx.req.url ?? '/', origin).toString(),
      userAgent: ctx.req.headers['user-agent'],
      ja4: getTrustedClientJa4(ctx.req),
      proofHeader: header,
      sessionHeader: typeof sessionHeader === 'string' ? sessionHeader : undefined,
      fetchUser: userId => getPrivateUserByAny(userId, { readOnly: false }),
    })
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      err.code === DBSC_PROOF_REQUIRED
    )
      return requestNewChallenge(ctx, deviceToken, origin, sessionId)
    throw err
  }
  const refreshed = await refreshSessionState({
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    ja4: getTrustedClientJa4(ctx.req),
    fetchUser: userId => getPrivateUserByAny(userId, { readOnly: false }),
    dbscProof: proof,
  })
  setAuthenticationCookies(ctx, refreshed)
  ctx.set('Cache-Control', 'no-store')
  ctx.json(dbscSessionInstructions(proof.sid, origin))
})

async function requestNewChallenge(
  ctx: Context,
  deviceToken: string,
  origin: string,
  sessionId: string,
): Promise<void> {
  const nonce = await createDbscRefreshChallenge({
    deviceToken,
    userAgent: ctx.req.headers['user-agent'],
    ja4: getTrustedClientJa4(ctx.req),
    origin,
    sessionId,
  })
  ctx.assert(nonce, 401, 'Device session refresh unavailable')
  ctx.setStatus(403)
  ctx.set('Cache-Control', 'no-store')
  ctx.set('Secure-Session-Challenge', `"${nonce}";id="${sessionId}"`)
  ctx.json({ code: DBSC_PROOF_REQUIRED })
}
