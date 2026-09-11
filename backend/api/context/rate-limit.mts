import type { Application, Context } from '@jongleberry/api-server'
import {
  checkRouteRateLimit,
  isRouteRateLimitEnabled,
  resolveRateLimitIdentities,
} from '@services/route-rate-limits'

interface RouteRateLimitExtras {
  email?: string
  deviceToken?: string
  sessionToken?: string
}

declare module '@jongleberry/api-server' {
  interface Context {
    applyRouteRateLimit(routeKey: string, extras?: RouteRateLimitExtras): Promise<void>
  }
}

const extensions = {
  async applyRouteRateLimit(
    this: Context,
    routeKey: string,
    extras?: RouteRateLimitExtras,
  ): Promise<void> {
    if (!isRouteRateLimitEnabled()) return

    const ctx = this
    // Pre-compute session data once so identity resolution does not trigger a
    // second JWT/Valkey check. Route rate limiting uses signed session claims
    // and does not load the private user record on the hot path.
    const { sessionData, deviceData } = await resolveRouteRateLimitTokenData(ctx, extras)
    const deviceClass =
      deviceData && 'dc' in deviceData && deviceData.dc === 'attested' ? 'attested' : undefined

    const identities = await resolveRateLimitIdentities({
      ip: ctx.ip ?? 'unknown',
      deviceClass,
      getSessionTokenData: () =>
        Promise.resolve({
          did: sessionData.did ?? undefined,
          sid: sessionData.sid ?? undefined,
          uid: sessionData.uid ?? undefined,
          tt: 'tt' in sessionData ? sessionData.tt : undefined,
        }),
    })

    if (extras?.email) identities.email = extras.email

    const result = await checkRouteRateLimit(routeKey, identities, null)

    if (result.limit > 0) {
      this.set('X-RateLimit-Limit', String(result.limit))
      this.set('X-RateLimit-Remaining', String(result.remaining))
    }

    if (result.limited) {
      this.set('Retry-After', String(result.retryAfterSeconds))
      this.throw(429, 'Rate limit exceeded. Please try again later.')
    }
  },
}

async function resolveRouteRateLimitTokenData(ctx: Context, extras?: RouteRateLimitExtras) {
  if (extras?.deviceToken === undefined && extras?.sessionToken === undefined) {
    const [sessionData, deviceData] = await Promise.all([
      ctx.getSessionTokenData(),
      ctx.getDeviceTokenData(),
    ])
    return { sessionData, deviceData }
  }

  const deviceToken = extras.deviceToken
  const sessionToken = extras.sessionToken
  const deviceData = deviceToken ? await ctx.getDeviceTokenData(deviceToken) : undefined

  if (deviceToken && sessionToken) {
    return { sessionData: await ctx.getSessionTokenData(sessionToken, deviceToken), deviceData }
  }

  return {
    sessionData: {
      did: deviceData?.did,
      sid: undefined,
      uid: null,
    },
    deviceData,
  }
}

export default function applyRateLimitContext(app: Application): void {
  app.extend(extensions)
}
