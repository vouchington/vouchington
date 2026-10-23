import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { createDeviceAndSessionTokens, createSessionToken } from './create.mts'
import { revokeSessionForLogout } from './web-refresh.mts'
import type { RefreshedSessionState } from './types.mts'
import { resolveDeviceState } from './session-state-helpers.mts'

export async function resetSessionState(options: {
  deviceToken?: string
  sessionToken?: string
}): Promise<RefreshedSessionState> {
  const deviceState = await resolveDeviceState(options.deviceToken)

  // A signed web refresh credential may end its own session after the access cookie expires.
  // An unpaired access token alone never authorizes revocation.
  await revokeSessionForLogout(options)

  const did = deviceState.valid ? deviceState.did : mintUUIDv7()

  // Re-use the existing device token when valid — only a new session token is needed.
  const previousDevice = deviceState.token ? await verifyDeviceJwt(deviceState.token) : null
  if (deviceState.token && !previousDevice?.refresh_uid) {
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

  const tokens = await createDeviceAndSessionTokens({ did, deviceClass: deviceState.dc })
  return {
    did,
    dt: tokens.deviceToken.token,
    st: tokens.sessionToken.token,
    sid: tokens.sessionToken.payload.sid,
    uid: null,
    session: tokens.sessionToken.payload,
    deviceClass: tokens.deviceToken.payload.dc,
  }
}
