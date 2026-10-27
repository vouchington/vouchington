import type { DeviceTokenPayload, SessionTokenPayload } from '@ts-shared/session-jwt'

/** Both signed halves must carry exactly the same original completed-factor proof. */
export function isStrictSessionTokenPair(
  device: DeviceTokenPayload,
  session: SessionTokenPayload,
): boolean {
  if (device.did !== session.did || device.mfa_at !== session.mfa_at) return false
  if (!session.uid) return true
  return Boolean(
    device.jti &&
    session.client &&
    typeof session.iat === 'number' &&
    typeof session.exp === 'number' &&
    typeof device.iat === 'number' &&
    typeof device.exp === 'number' &&
    device.client === session.client &&
    device.refresh_uid === session.uid &&
    device.refresh_sid === session.sid &&
    (session.client !== 'native' || device.dc === 'attested') &&
    (session.client !== 'web' ||
      (session.ua_hash &&
        device.ua_hash === session.ua_hash &&
        device.ja4_hash === session.ja4_hash)),
  )
}
