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

type RouteRateLimitResult = Awaited<ReturnType<typeof checkRouteRateLimit>>

// The limiter step's outcome, held until settleRouteRateLimit applies it. `null` means the
// limiter is disabled, so nothing is applied or metered.
export type RouteRateLimitCheck = { result: RouteRateLimitResult; userId: string | null } | null

declare module '@jongleberry/api-server' {
  interface Context {
    applyRouteRateLimit(routeKey: string, extras?: RouteRateLimitExtras): Promise<void>
    // Limiter step: needs session-token data only (no PostgreSQL), so it can overlap the user
    // fetch. It charges the limiter but sets no headers and throws no 429.
    prepareRouteRateLimit(
      routeKey: string,
      extras?: RouteRateLimitExtras,
    ): Promise<RouteRateLimitCheck>
    // Applies the limiter headers/429, then meters usage (which reuses `ctx.currentUser`).
    settleRouteRateLimit(routeKey: string, check: RouteRateLimitCheck): Promise<void>
  }
}

const extensions = {
  async applyRouteRateLimit(
    this: Context,
    routeKey: string,
    extras?: RouteRateLimitExtras,
  ): Promise<void> {
    await this.settleRouteRateLimit(routeKey, await this.prepareRouteRateLimit(routeKey, extras))
  },

  async settleRouteRateLimit(
    this: Context,
    routeKey: string,
    check: RouteRateLimitCheck,
  ): Promise<void> {
    if (!check) return
    applyRateLimitResult(this, check.result)
    await meterRestUsage(this, routeKey, check.userId)
  },

  async prepareRouteRateLimit(
    this: Context,
    routeKey: string,
    extras?: RouteRateLimitExtras,
  ): Promise<RouteRateLimitCheck> {
    if (!isRouteRateLimitEnabled()) return null

    // Pre-compute session data once so identity resolution does not trigger a
    // second JWT/Valkey check. Route rate limiting uses signed session claims
    // and does not load the private user record on the hot path.
    if (extras?.identityMode === 'ip-only') {
      const result = await checkRouteRateLimit(routeKey, { ip: this.ip ?? 'unknown' }, null)
      return { result, userId: null }
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

    const result = await checkRouteRateLimit(routeKey, identities, null)
    return { result, userId: sessionData.uid ?? null }
  },
}

function applyRateLimitResult(ctx: Context, result: RouteRateLimitResult): void {
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
