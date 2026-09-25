import type { Context } from '@jongleberry/api-server'
import { setAuthenticationCookies } from '@modules/api-utils'
import { completeMfaLoginWithContext, getAndDeleteLoginAttempt } from '@services/mfa'
import { getPrivateUserByAny } from '@services/users/get'
import { getDeviceContext } from '../device-context.mts'

// Shared by every MFA verification route (TOTP, passkey) once its own factor-specific check has
// verified the caller. Consumes the attempt only here, after verification has already succeeded,
// so a cancelled or failed attempt doesn't destroy it before a retry.
export async function completeMfaVerification(ctx: Context, loginAttemptId: string): Promise<void> {
  const consumedAttempt = await getAndDeleteLoginAttempt(loginAttemptId)
  ctx.assert(consumedAttempt, 401, 'Login attempt expired or invalid')

  const user = await getPrivateUserByAny(consumedAttempt.userId)
  const login = await completeMfaLoginWithContext(consumedAttempt, user, getDeviceContext(ctx))
  setAuthenticationCookies(ctx, {
    dt: login.deviceToken.token,
    st: login.sessionToken.token,
    deviceClass: login.deviceClass,
  })
  ctx.json({
    user: { id: login.userId },
    dt: login.deviceToken,
    st: login.sessionToken,
    session: login.sessionToken.payload,
  })
}
