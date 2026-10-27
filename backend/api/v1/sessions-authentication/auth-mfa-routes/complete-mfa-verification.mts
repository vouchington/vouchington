import { advertiseDbscRegistration } from '../dbsc-registration-helpers.mts'
import { isNativeClientTransportRequest } from '@modules/request-client-info'
import type { Context } from '@jongleberry/api-server'
import { setAuthenticationCookies } from '@modules/api-utils'
import {
  clearMfaLoginAttempts,
  completeMfaLoginWithContext,
  getAndDeleteLoginAttempt,
  type CompletedMfaLogin,
  type VerifiedMfaFactor,
} from '@services/mfa'
import { getPrivateUserByAny } from '@services/users/get'
import { getDeviceContext } from '../device-context.mts'

interface MfaVerificationResponseBody {
  user: { id: string }
  dt?: CompletedMfaLogin['deviceToken']
  st?: CompletedMfaLogin['sessionToken']
  session: CompletedMfaLogin['sessionToken']['payload']
}

// Shared by every MFA verification route (TOTP, passkey) once its own factor-specific check has
// verified the caller. Consumes the attempt only here, after verification has already succeeded,
// so a cancelled or failed attempt doesn't destroy it before a retry. Returns the response body
// instead of calling `ctx.json` itself: the OpenAPI response-contract analyzer statically
// attributes a `ctx.json(...)` call to exactly one route, so that call must stay at each route's
// own call site, which two different routes share this helper.
export async function completeMfaVerification(
  ctx: Context,
  loginAttemptId: string,
  factor: VerifiedMfaFactor,
): Promise<MfaVerificationResponseBody> {
  const consumedAttempt = await getAndDeleteLoginAttempt(loginAttemptId)
  ctx.assert(consumedAttempt, 401, 'Login attempt expired or invalid')

  await clearMfaLoginAttempts(loginAttemptId, consumedAttempt)
  const login = await completeMfaLoginWithContext(
    consumedAttempt,
    (userId, query) => getPrivateUserByAny(userId, { query }),
    factor,
    getDeviceContext(ctx),
  )
  setAuthenticationCookies(ctx, {
    dt: login.deviceToken.token,
    st: login.sessionToken.token,
    deviceClass: login.deviceClass,
  })
  await advertiseDbscRegistration(ctx, login.deviceToken)
  return {
    user: { id: login.userId },
    ...(isNativeClientTransportRequest(ctx.req) && {
      dt: login.deviceToken,
      st: login.sessionToken,
    }),
    session: login.sessionToken.payload,
  }
}
