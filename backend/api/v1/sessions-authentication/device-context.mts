import { getTrustedClientJa4 } from '@modules/request-client-info/cloudflare-signals'
import type { Context } from '@jongleberry/api-server'
import type { DeviceContext } from '@services/jwt-session'

export function getDeviceContext(ctx: Context): DeviceContext {
  const userAgent = ctx.req.headers['user-agent']
  return {
    ip_address: ctx.ip,
    ja4: getTrustedClientJa4(ctx.req),
    user_agent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  }
}
