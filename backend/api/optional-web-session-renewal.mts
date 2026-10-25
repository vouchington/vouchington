import type { Context } from '@jongleberry/api-server'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'

/** A device credential may request renewal; it never authorizes an optional route. */
export async function hasSignedWebRefreshCredential(ctx: Context): Promise<boolean> {
  const deviceToken = ctx.cookies.get('dt')
  if (!deviceToken) return false
  const device = await verifyDeviceJwt(deviceToken)
  return (
    device?.client === 'web' &&
    typeof device.refresh_uid === 'string' &&
    typeof device.refresh_sid === 'string'
  )
}
