import app from '../../app.mts'
import { DEVICE_EXPIRATION_SECONDS, sessionExpirySecondsFor } from '@ts-shared/session-jwt'
import { refreshSessionState, resetSessionState } from '@services/jwt-session'
import { setAuthenticationCookies, COOKIE_OPTIONS } from '@modules/api-utils'
import { getPrivateUserByAny } from '@services/users/get'
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
  dt?: unknown
  st?: unknown
}

// NOTE: this route should only ever be called from Next.js or from the app, never from the web
app
  .route('/api/v1/session')
  .patch(async (ctx: Context) => {
    const { dt, st } = await parseSessionJsonBody(ctx, 'PATCH:/api/v1/session')
    await applySessionBodyRateLimit(ctx, 'PATCH:/api/v1/session', { dt, st })
    ctx.assert(!dt || typeof dt === 'string', 422, 'Invalid Device Token')
    ctx.assert(!st || typeof st === 'string', 422, 'Invalid Session Token')
    const deviceToken = typeof dt === 'string' ? dt : undefined
    const sessionToken = typeof st === 'string' ? st : undefined

    const sessionState = await refreshSessionState({
      deviceToken,
      sessionToken,
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
      const body = await parseSessionJsonBody(ctx, 'DELETE:/api/v1/session')
      await applySessionBodyRateLimit(ctx, 'DELETE:/api/v1/session', body)
      dt = typeof body.dt === 'string' ? body.dt : undefined
      st = typeof body.st === 'string' ? body.st : undefined
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

async function parseSessionJsonBody(ctx: Context, routeKey: string): Promise<SessionTokenBody> {
  try {
    const body = await ctx.request.json('100kb')
    if (!body || typeof body !== 'object') return {}
    return body as SessionTokenBody
  } catch {
    await ctx.applyRouteRateLimit(routeKey)
    ctx.throw(422, 'Invalid body')
  }
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
