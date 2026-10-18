import type { Application, Context } from '@jongleberry/api-server'
import { installRouteRateLimit, type RouteRateLimitExtras } from '@vouchington/rate-limit'
import {
  checkRouteRateLimit,
  isRouteRateLimitEnabled,
  resolveRateLimitIdentities,
} from '@services/route-rate-limits'
import { meterRestUsage } from '../rest-usage-meter.mts'

export default function applyRateLimitContext(app: Application): void {
  installRouteRateLimit(app, {
    isEnabled: isRouteRateLimitEnabled,
    message: 'Rate limit exceeded. Please try again later.',
    async resolveIdentities(ctx, _routeKey, extras) {
      // Pre-compute session data once so identity resolution does not trigger a
      // second JWT/Valkey check. Route rate limiting uses signed session claims
      // and does not load the private user record on the hot path.
      if (extras?.identityMode === 'ip-only') {
        return { identities: { ip: ctx.ip ?? 'unknown' }, subject: null }
      }

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

      if (typeof extras?.email === 'string') identities.email = extras.email

      return {
        identities: {
          ...identities,
          userTrustTier: identities.userTrustTier?.toString(),
        },
        subject: sessionData.uid ?? null,
      }
    },
    check(routeKey, identities) {
      const userTrustTier = identities.userTrustTier
      return checkRouteRateLimit(
        routeKey,
        {
          ip: identities.ip,
          deviceId: identities.deviceId,
          sessionId: identities.sessionId,
          userId: identities.userId,
          userTrustTier: userTrustTier === undefined ? undefined : Number(userTrustTier),
          apiKeyId: identities.apiKeyId,
          email: identities.email,
          deviceClass: identities.deviceClass === 'attested' ? 'attested' : undefined,
        },
        null,
      )
    },
    onSettled: meterRestUsage,
  })
}

async function resolveRouteRateLimitTokenData(ctx: Context, extras?: RouteRateLimitExtras) {
  if (extras?.deviceToken === undefined && extras?.sessionToken === undefined) {
    const [sessionData, deviceData] = await Promise.all([
      ctx.getSessionTokenData(),
      ctx.getDeviceTokenData(),
    ])
    return { sessionData, deviceData }
  }

  const deviceToken = typeof extras?.deviceToken === 'string' ? extras.deviceToken : undefined
  const sessionToken = typeof extras?.sessionToken === 'string' ? extras.sessionToken : undefined
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
