import { isHttpError } from 'http-errors'
import app from '../../app.mts'
import { DEVICE_EXPIRATION_SECONDS, sessionExpirySecondsFor } from '@ts-shared/session-jwt'
import { isNativeClientTransportRequest } from '@modules/request-client-info'
import { refreshSessionState, resetSessionState } from '@services/jwt-session'
import { setAuthenticationCookies, COOKIE_OPTIONS } from '@modules/api-utils'
import { getPrivateUserByAny } from '@services/users/get'
import { parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import type { Context } from '@jongleberry/api-server'

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

// Web callers refresh via httpOnly cookies; native callers retain explicit token transport.
app
  .route('/api/v1/session')
  .patch(async (ctx: Context) => {
    const routeKey = 'PATCH:/api/v1/session'
    // The parse-and-cast below must stay lexically inside each route's own handler: the OpenAPI
    // request-contract harvester statically attributes a `parseJsonBody(ctx, ...) as T` cast to
    // exactly one route, so it can't live in a helper this route shares with DELETE's JSON
    // branch. `rateLimitAndValidateSessionBody` covers everything after the cast, which has no
    // such restriction.
    let rawBody: SessionTokenBody
    try {
      rawBody = (await parseJsonBody(ctx, '100kb')) as SessionTokenBody
    } catch (err) {
      await ctx.applyRouteRateLimit(routeKey)
      if (isHttpError(err) && err.status === 422) throw err
      ctx.throw(422, 'Invalid body')
    }
    const tokens = await rateLimitAndValidateSessionBody(ctx, routeKey, rawBody)
    const dt = tokens.dt ?? ctx.cookies.get('dt')
    const st = tokens.st ?? ctx.cookies.get('st')

    const sessionState = await refreshSessionState({
      deviceToken: dt,
      sessionToken: st,
      fetchUser: getPrivateUserByAny,
      userAgent: ctx.req.headers['user-agent'],
      verifyRevocationOnHotPath: true,
    })

    const body: SessionBody = {
      dte: DEVICE_EXPIRATION_SECONDS,
      ste: sessionExpirySecondsFor(sessionState.deviceClass, sessionState.session.client),
      secure: COOKIE_OPTIONS.secure,
      did: sessionState.did,
      ...((sessionState.session.client === 'native' ||
        (!sessionState.uid && isNativeClientTransportRequest(ctx.req))) && {
        dt: sessionState.dt,
        st: sessionState.st,
      }),
      sid: sessionState.sid,
      uid: sessionState.uid,
      session: sessionState.session,
    }

    setAuthenticationCookies(ctx, {
      dt: sessionState.dt,
      st: sessionState.st,
      deviceClass: sessionState.deviceClass,
    })

    ctx.json({ session: body })
  })
  .delete(async (ctx: Context) => {
    // Revoke the old session and remove any device refresh authority.
    let dt, st
    if (ctx.request.is('json')) {
      const routeKey = 'DELETE:/api/v1/session'
      // See the PATCH handler above: this cast must stay inline here, not in a shared helper —
      // the OpenAPI request-contract harvester can't attribute a cast shared by two routes.
      let rawBody: SessionTokenBody
      try {
        rawBody = (await parseJsonBody(ctx, '100kb')) as SessionTokenBody
      } catch (err) {
        await ctx.applyRouteRateLimit(routeKey)
        if (isHttpError(err) && err.status === 422) throw err
        ctx.throw(422, 'Invalid body')
      }
      ;({ dt, st } = await rateLimitAndValidateSessionBody(ctx, routeKey, rawBody))
    } else {
      await ctx.applyRouteRateLimit('DELETE:/api/v1/session')
      validateRequestContract(ctx, 'DELETE:/api/v1/session', { body: {} })
      dt = ctx.cookies.get('dt')
      st = ctx.cookies.get('st')
    }

    const sessionState = await resetSessionState({
      deviceToken: dt,
      sessionToken: st,
      userAgent: ctx.req.headers['user-agent'],
    })

    const body: SessionBody = {
      dte: DEVICE_EXPIRATION_SECONDS,
      ste: sessionExpirySecondsFor(sessionState.deviceClass, sessionState.session.client),
      secure: COOKIE_OPTIONS.secure,
      did: sessionState.did,
      ...((sessionState.session.client === 'native' ||
        (!sessionState.uid && isNativeClientTransportRequest(ctx.req))) && {
        dt: sessionState.dt,
        st: sessionState.st,
      }),
      sid: sessionState.sid,
      uid: sessionState.uid,
      session: sessionState.session,
    }

    setAuthenticationCookies(ctx, {
      dt: sessionState.dt,
      st: sessionState.st,
      deviceClass: sessionState.deviceClass,
    })

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
