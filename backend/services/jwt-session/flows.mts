import { ensureAnonymousSession, isUUIDv7 } from '@ts-shared/session-jwt'
import { verifyDeviceAndSessionTokens } from './verify.mts'
import { issueAnonSession } from './refresh-token-rotation.mts'
import { trackAuthSessionEvent } from '@services/analytics'
import type { FetchUserForSession, RefreshedSessionState, SessionTokenPayload } from './types.mts'
import { applyHotWarmCold } from './hot-warm-cold.mts'

export type { FetchUserForSession } from './types.mts'

export async function refreshSessionState(options: {
  deviceToken?: string
  sessionToken?: string
  fetchUser: FetchUserForSession
  verifyRevocationOnHotPath?: boolean
}): Promise<RefreshedSessionState> {
  if (options.deviceToken && options.sessionToken) {
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: options.deviceToken,
      sessionToken: options.sessionToken,
    })

    if (verified && !verified.uid) {
      if (!isUUIDv7(verified.did) || !isUUIDv7(verified.sid)) {
        return issueAnonSession(verified.did, options.deviceToken, verified.dc)
      }

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
