import { isHttpError } from 'http-errors'
import { buildSessionResponse } from './session-response.mts'
import { getTrustedClientJa4 } from '@modules/request-client-info/cloudflare-signals'
import app from '../../app.mts'
import onError from '@modules/on-error'
import {
  refreshSessionState,
  resetSessionState,
  revokeSessionForLogout,
} from '@services/jwt-session'
import { setAuthenticationCookies, clearAuthenticationCookies } from '@modules/api-utils'
import { getPrivateUserByAny } from '@services/users/get'
import { parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import type { Context } from '@jongleberry/api-server'

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
      fetchUser: userId => getPrivateUserByAny(userId, { readOnly: false }),
      userAgent: ctx.req.headers['user-agent'],
      ja4: getTrustedClientJa4(ctx.req),
    }).catch(err => {
      clearAuthenticationCookies(ctx)
      throw err
    })

    const body = buildSessionResponse(ctx, sessionState)

    setAuthenticationCookies(ctx, {
      dt: sessionState.dt,
      st: sessionState.st,
      deviceClass: sessionState.deviceClass,
    })

    ctx.json({ session: body })
  })
  .delete(async (ctx: Context) => {
    // Clear cookies even when parsing, rate limiting, or durable cleanup rejects.
    clearAuthenticationCookies(ctx)
    const cookieDt = ctx.cookies.get('dt')
    const cookieSt = ctx.cookies.get('st')
    let dt = cookieDt,
      st = cookieSt
    try {
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
        const candidate = toTokenBody(rawBody)
        dt = typeof candidate.dt === 'string' ? candidate.dt : cookieDt
        st = typeof candidate.st === 'string' ? candidate.st : cookieSt
        await rateLimitAndValidateSessionBody(ctx, routeKey, rawBody)
      } else {
        await ctx.applyRouteRateLimit('DELETE:/api/v1/session')
        validateRequestContract(ctx, 'DELETE:/api/v1/session', { body: {} })
      }

      dt ??= ctx.cookies.get('dt')
      st ??= ctx.cookies.get('st')
      const sessionState = await resetSessionState({ deviceToken: dt, sessionToken: st })

      const body = buildSessionResponse(ctx, sessionState)

      clearAuthenticationCookies(ctx)

      ctx.json({ session: body })
    } catch (err) {
      clearAuthenticationCookies(ctx)
      await revokeSessionForLogout({ deviceToken: cookieDt, sessionToken: cookieSt }).catch(err =>
        onError(err instanceof Error ? err : new Error(String(err))),
      )
      if (dt !== cookieDt || st !== cookieSt)
        await revokeSessionForLogout({ deviceToken: dt, sessionToken: st }).catch(err =>
          onError(err instanceof Error ? err : new Error(String(err))),
        )
      throw err
    }
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
