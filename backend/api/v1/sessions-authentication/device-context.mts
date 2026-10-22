import { getOptionalRequestClientInfo } from '@modules/request-client-info'
import type { Context } from '@jongleberry/api-server'
import type { DeviceContext } from '@services/jwt-session'

export function getDeviceContext(ctx: Context): DeviceContext {
  const userAgent = ctx.req.headers['user-agent']
  return {
    ip_address: ctx.ip,
    isNativeClient: ['swift', 'dotnet'].includes(getOptionalRequestClientInfo()?.client ?? ''),
    user_agent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  }
}
