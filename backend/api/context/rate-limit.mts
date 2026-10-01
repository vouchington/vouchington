import type { Application, Context } from '@jongleberry/api-server'
import {
  checkRouteRateLimit,
  isRouteRateLimitEnabled,
  resolveRateLimitIdentities,
} from '@services/route-rate-limits'
import { meterRestUsage } from '../rest-usage-meter.mts'

interface RouteRateLimitExtras {
  email?: string
  deviceToken?: string
  sessionToken?: string
  identityMode?: 'ip-only'
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

    // Pre-compute session data once so identity resolution does not trigger a
    // second JWT/Valkey check. Route rate limiting uses signed session claims
    // and does not load the private user record on the hot path.
    if (extras?.identityMode === 'ip-only') {
      const result = await checkRouteRateLimit(routeKey, { ip: this.ip ?? 'unknown' }, null)
      applyRateLimitResult(this, result)
      await meterRestUsage(this, routeKey, null)
      return
    }

    const { sessionData, deviceData } = await resolveRouteRateLimitTokenData(this, extras)
    const deviceClass =
      deviceData && 'dc' in deviceData && deviceData.dc === 'attested' ? 'attested' : undefined

    const identities = await resolveRateLimitIdentities({
      ip: this.ip ?? 'unknown',
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

    applyRateLimitResult(this, await checkRouteRateLimit(routeKey, identities, null))
    await meterRestUsage(this, routeKey, sessionData.uid ?? null)
  },
}

function applyRateLimitResult(
  ctx: Context,
  result: Awaited<ReturnType<typeof checkRouteRateLimit>>,
): void {
  if (result.limit > 0) {
    ctx.set('X-RateLimit-Limit', String(result.limit))
    ctx.set('X-RateLimit-Remaining', String(result.remaining))
  }
  if (result.limited) {
    ctx.set('Retry-After', String(result.retryAfterSeconds))
    ctx.throw(429, 'Rate limit exceeded. Please try again later.')
  }
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
