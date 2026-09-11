import { isUUIDv7, mintUUIDv7 } from '@ts-shared/session-jwt'
import { createDeviceAndSessionTokens, createSessionToken } from './create.mts'
import { revokeSession } from './revocation.mts'
import { verifyDeviceAndSessionTokens } from './verify.mts'
import type { RefreshedSessionState } from './types.mts'
import { resolveDeviceState } from './session-state-helpers.mts'

export async function resetSessionState(options: {
  deviceToken?: string
  sessionToken?: string
}): Promise<RefreshedSessionState> {
  const deviceState = await resolveDeviceState(options.deviceToken)

  // Only revoke uid-bearing sessions when dt and st are a valid matching pair.
  // Without a valid dt, st alone must not drive revocation — an attacker holding only a
  // victim's st could otherwise DoS them by forcing logout. See
  // docs/requirements/security/SECURITY.md and jwt-session/CLAUDE.md "No st-only fallback".
  if (deviceState.token && options.sessionToken) {
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: deviceState.token,
      sessionToken: options.sessionToken,
    })
    if (verified !== false && verified.uid) await revokeSession(verified.sid)
  }

  const did = deviceState.valid ? deviceState.did : mintUUIDv7()

  // Re-use the existing device token when valid — only a new session token is needed.
  if (deviceState.token) {
    if (!isUUIDv7(did)) {
      const tokens = await createDeviceAndSessionTokens({ did, deviceClass: deviceState.dc })
      return {
        did: tokens.deviceToken.payload.did,
        dt: tokens.deviceToken.token,
        st: tokens.sessionToken.token,
        sid: tokens.sessionToken.payload.sid,
        uid: null,
        session: tokens.sessionToken.payload,
        deviceClass: tokens.deviceToken.payload.dc,
      }
    }

    const token = await createSessionToken({ did, deviceClass: deviceState.dc })
    return {
      did,
      dt: deviceState.token,
      st: token.token,
      sid: token.payload.sid,
      uid: null,
      session: token.payload,
      deviceClass: deviceState.dc,
    }
  }

  const tokens = await createDeviceAndSessionTokens({ did })
  return {
    did,
    dt: tokens.deviceToken.token,
    st: tokens.sessionToken.token,
    sid: tokens.sessionToken.payload.sid,
    uid: null,
    session: tokens.sessionToken.payload,
  }
}
