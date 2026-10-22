import { assertSessionUserAgent } from './client-binding.mts'
import { refreshWebSessionFromDeviceToken } from './web-refresh.mts'
import { ensureAnonymousSession } from '@ts-shared/session-jwt'
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
  verifyRevocationOnHotPath?: boolean
}): Promise<RefreshedSessionState> {
  if (options.deviceToken && options.sessionToken) {
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: options.deviceToken,
      sessionToken: options.sessionToken,
    })

    if (verified) assertSessionUserAgent(verified, options.userAgent)
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
        verified,
        verified.did,
        options.deviceToken,
        options.sessionToken,
        options.fetchUser,
        { verifyRevocationOnHotPath: options.verifyRevocationOnHotPath },
      )
    }
  }

  if (options.deviceToken) {
    const refreshed = await refreshWebSessionFromDeviceToken(
      options.deviceToken,
      options.userAgent,
      options.fetchUser,
    )
    if (refreshed) return refreshed
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
