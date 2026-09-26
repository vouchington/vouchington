import app from '../../app.mts'
import { DEVICE_EXPIRATION_SECONDS, sessionExpirySecondsFor } from '@ts-shared/session-jwt'
import { refreshSessionState, resetSessionState } from '@services/jwt-session'
import { setAuthenticationCookies, COOKIE_OPTIONS } from '@modules/api-utils'
import { getPrivateUserByAny } from '@services/users/get'
import { validateRequestContract } from '../../response-helpers.mts'
import type { Context } from '@jongleberry/api-server'

const isTest = process.env.NODE_ENV === 'test'

interface SessionBody {
  dte: number
  ste: number
  secure: boolean
  did?: string
  dt?: string
  st?: string
  sid?: string
  uid?: string | null
  session?: {
    did: string
    sid: string
    uid: string | null
  }
}

interface SessionTokenBody {
  dt?: string
  st?: string
}

// NOTE: this route should only ever be called from Next.js or from the app, never from the web
app
  .route('/api/v1/session')
  .patch(async (ctx: Context) => {
    const routeKey = 'PATCH:/api/v1/session'
    // The parse-and-cast below must stay lexically inside each route's own handler: the OpenAPI
    // request-contract harvester statically attributes a `ctx.request.json(...) as T` cast to
    // exactly one route, so it can't live in a helper this route shares with DELETE's JSON
    // branch. `rateLimitAndValidateSessionBody` covers everything after the cast, which has no
    // such restriction.
    let rawBody: SessionTokenBody
    try {
      rawBody = (await ctx.request.json('100kb')) as SessionTokenBody
    } catch {
      await ctx.applyRouteRateLimit(routeKey)
      ctx.throw(422, 'Invalid body')
    }
    const { dt, st } = await rateLimitAndValidateSessionBody(ctx, routeKey, rawBody)

    const sessionState = await refreshSessionState({
      deviceToken: dt,
      sessionToken: st,
      fetchUser: getPrivateUserByAny,
      verifyRevocationOnHotPath: true,
    })

    const body: SessionBody = {
      dte: DEVICE_EXPIRATION_SECONDS,
      ste: sessionExpirySecondsFor(sessionState.deviceClass),
      secure: COOKIE_OPTIONS.secure,
      did: sessionState.did,
      dt: sessionState.dt,
      st: sessionState.st,
      sid: sessionState.sid,
      uid: sessionState.uid,
      session: sessionState.session,
    }

    // only set cookies via this API in test because otherwise tests would be annoying to write
    if (isTest) {
      setAuthenticationCookies(ctx, { dt: body.dt!, st: body.st! })
    }

    ctx.json({ session: body })
  })
  .delete(async (ctx: Context) => {
    // Invalidate the old session and issue a new one. The device token is preserved if valid;
    // createDeviceAndSessionTokens always creates both tokens but the new device token is
    // discarded when the client already has one (no createSessionToken-only path exists —
    // the Lua script updates both records atomically).
    let dt, st
    if (ctx.request.is('json')) {
      const routeKey = 'DELETE:/api/v1/session'
      // See the PATCH handler above: this cast must stay inline here, not in a shared helper —
      // the OpenAPI request-contract harvester can't attribute a cast shared by two routes.
      let rawBody: SessionTokenBody
      try {
        rawBody = (await ctx.request.json('100kb')) as SessionTokenBody
      } catch {
        await ctx.applyRouteRateLimit(routeKey)
        ctx.throw(422, 'Invalid body')
      }
      ;({ dt, st } = await rateLimitAndValidateSessionBody(ctx, routeKey, rawBody))
    } else {
      await ctx.applyRouteRateLimit('DELETE:/api/v1/session')
      dt = ctx.cookies.get('dt')
      st = ctx.cookies.get('st')
    }

    const sessionState = await resetSessionState({
      deviceToken: dt,
      sessionToken: st,
    })

    const body: SessionBody = {
      dte: DEVICE_EXPIRATION_SECONDS,
      ste: sessionExpirySecondsFor(sessionState.deviceClass),
      secure: COOKIE_OPTIONS.secure,
      did: sessionState.did,
      dt: sessionState.dt,
      st: sessionState.st,
      sid: sessionState.sid,
      uid: sessionState.uid,
      session: sessionState.session,
    }

    // only set cookies via this API in test because otherwise tests would be annoying to write
    if (isTest) {
      setAuthenticationCookies(ctx, { dt: body.dt!, st: body.st! })
    }

    ctx.json({ session: body })
  })

// A JSON body that parsed successfully but isn't a plain object (null, an array, a string, a
// number) has no dt/st to read — treat it the same as an empty body for rate-limiting purposes.
// `validateRequestContract` is given the raw, un-defaulted value separately so it can reject the
// malformed shape with a 422 instead of silently falling back to `{}`.
function toTokenBody(body: SessionTokenBody): SessionTokenBody {
  const isPlainObject = body !== null && typeof body === 'object' && !Array.isArray(body)
  return isPlainObject ? body : {}
}

// Shared by the PATCH and DELETE JSON-body branches, once each has already parsed its own body
// (see the inline comment at each call site for why the parse itself isn't shared): rate-limit on
// the tokens the body names, then validate it against the request contract.
async function rateLimitAndValidateSessionBody(
  ctx: Context,
  routeKey: string,
  rawBody: SessionTokenBody,
): Promise<SessionTokenBody> {
  const tokenBody = toTokenBody(rawBody)
  await applySessionBodyRateLimit(ctx, routeKey, tokenBody)
  validateRequestContract(ctx, routeKey, { body: rawBody })
  return tokenBody
}

async function applySessionBodyRateLimit(
  ctx: Context,
  routeKey: string,
  body: SessionTokenBody,
): Promise<void> {
  await ctx.applyRouteRateLimit(routeKey, {
    deviceToken: typeof body.dt === 'string' ? body.dt : undefined,
    sessionToken: typeof body.st === 'string' ? body.st : undefined,
  })
}
