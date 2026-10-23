import { assertSessionClientBinding } from './client-binding.mts'
import { refreshWebSessionFromDeviceToken } from './web-refresh.mts'
import { ensureAnonymousSession, verifyDeviceJwt } from '@ts-shared/session-jwt'
import { AUTH_REQUIRED } from '@modules/on-error/error-codes'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { verifyDeviceAndSessionTokens } from './verify.mts'
import { trackAuthSessionEvent } from '@services/analytics'
import type { FetchUserForSession, RefreshedSessionState, SessionTokenPayload } from './types.mts'
import { applyHotWarmCold } from './hot-warm-cold.mts'

export type { FetchUserForSession } from './types.mts'

export async function refreshSessionState(options: {
  deviceToken?: string
  sessionToken?: string
  fetchUser: FetchUserForSession
  userAgent?: string
  ja4?: string
  clock?: () => number
}): Promise<RefreshedSessionState> {
  if (options.deviceToken && options.sessionToken) {
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: options.deviceToken,
      sessionToken: options.sessionToken,
    })

    if (verified) assertSessionClientBinding(verified, options.userAgent, options.ja4)
    if (verified && !verified.uid) {
      trackAuthSessionEvent({
        did: verified.did,
        sid: verified.sid,
        uid: null,
        eventType: 'refreshed_anonymous',
      })
      return {
        did: verified.did,
        dt: options.deviceToken,
        st: options.sessionToken,
        sid: verified.sid,
        uid: null,
        session: verified as SessionTokenPayload,
        deviceClass: verified.dc,
      }
    }

    if (verified && verified.uid) {
      return applyHotWarmCold(
        { ...verified, sca: 0 },
        verified.did,
        options.deviceToken,
        options.fetchUser,
        options.clock,
      )
    }
  }

  if (options.deviceToken) {
    const refreshed = await refreshWebSessionFromDeviceToken(
      options.deviceToken,
      options.userAgent,
      options.fetchUser,
      options.ja4,
    )
    if (refreshed) return refreshed
    const device = await verifyDeviceJwt(options.deviceToken)
    if (device?.client === 'native' && device.refresh_uid)
      throw createCodedError(
        401,
        'An active access token is required for native renewal',
        AUTH_REQUIRED,
      )
  }

  const result = await ensureAnonymousSession({
    deviceToken: options.deviceToken,
    sessionToken: options.sessionToken,
  })
  trackAuthSessionEvent({
    did: result.did,
    sid: result.sid,
    uid: null,
    eventType: result.mintedSt ? 'created' : 'refreshed_anonymous',
  })
  return {
    did: result.did,
    dt: result.dt,
    st: result.st,
    sid: result.sid,
    uid: null,
    session: result.session,
    deviceClass: result.dc,
  }
}
