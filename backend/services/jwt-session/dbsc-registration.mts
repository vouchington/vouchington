import { getWebRefreshAuthority } from './dbsc-proof.mts'
import { issueDbscChallenge } from './dbsc-state.mts'

/** Only a just-completed credential exchange may advertise initial registration. */
export async function createDbscRegistrationOffer(options: {
  deviceToken: string
  userAgent?: string
  ja4?: string
  origin: string
}): Promise<string | null> {
  const { authority } = await getWebRefreshAuthority(
    options.deviceToken,
    options.userAgent,
    options.ja4,
  )
  if (authority.kind !== 'unbound') return null
  return issueDbscChallenge({
    purpose: 'registration',
    uid: authority.uid,
    did: authority.did,
    sid: authority.sid,
    origin: options.origin,
  })
}

export async function createDbscRefreshChallenge(options: {
  deviceToken: string
  userAgent?: string
  ja4?: string
  origin: string
  sessionId: string
}): Promise<string | null> {
  const { authority } = await getWebRefreshAuthority(
    options.deviceToken,
    options.userAgent,
    options.ja4,
  )
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
