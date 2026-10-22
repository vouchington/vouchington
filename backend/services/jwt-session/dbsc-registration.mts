import { getWebRefreshAuthority } from './dbsc-proof.mts'
import { issueDbscChallenge } from './dbsc-state.mts'

/** Call only immediately after successful credential completion, never on cookie refresh. */
export async function createDbscRegistrationOffer(options: {
  deviceToken: string
  userAgent?: string
  origin: string
}): Promise<string | null> {
  const { authority } = await getWebRefreshAuthority(options.deviceToken, options.userAgent)
  if (authority.kind !== 'unbound' || authority.origin !== options.origin) return null
  return authority.registrationExpiresAt > Math.floor(Date.now() / 1000)
    ? authority.registrationNonce
    : null
}

export async function createDbscRefreshChallenge(options: {
  deviceToken: string
  userAgent?: string
  origin: string
  sessionId: string
}): Promise<string | null> {
  const { authority } = await getWebRefreshAuthority(options.deviceToken, options.userAgent)
  if (
    authority.kind !== 'bound' ||
    authority.origin !== options.origin ||
    authority.sid !== options.sessionId
  )
    return null
  return issueDbscChallenge({
    purpose: 'refresh',
    uid: authority.uid,
    did: authority.did,
    sid: authority.sid,
    origin: options.origin,
  })
}
