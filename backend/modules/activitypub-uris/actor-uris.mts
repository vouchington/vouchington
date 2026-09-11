import { getSiteOrigin, getSiteUrl } from '@modules/utils'

// Actor identity is always the stable userId — never the mutable username. There is intentionally
// no `getActorUriFromUsername`; callers must resolve a username to a userId first (see
// webfinger.mts for the one place username is allowed to appear in a federation-facing identifier).

export function getActorUri(userId: string): string {
  return getSiteUrl(`/ap/users/${userId}`)
}

export function getActorKeyId(userId: string): string {
  return `${getActorUri(userId)}#main-key`
}

export function getActorInboxUri(userId: string): string {
  return `${getActorUri(userId)}/inbox`
}

export function getActorOutboxUri(userId: string): string {
  return `${getActorUri(userId)}/outbox`
}

export function getActorFollowersUri(userId: string): string {
  return `${getActorUri(userId)}/followers`
}

export function getActorFollowingUri(userId: string): string {
  return `${getActorUri(userId)}/following`
}

export function getSharedInboxUri(): string {
  return getSiteUrl('/ap/inbox')
}

const ACTOR_URI_USER_ID_PATTERN = /^\/ap\/users\/([^/]+)$/

// Recovers the userId from one of our own actor URIs (e.g. to resolve the target of an inbound
// activity). Returns undefined for any URI that isn't a local actor URI in our own shape.
export function parseLocalActorUriUserId(actorUri: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(actorUri)
  } catch {
    return undefined
  }
  if (parsed.hostname !== new URL(getSiteOrigin()).hostname) return undefined
  return ACTOR_URI_USER_ID_PATTERN.exec(parsed.pathname)?.[1]
}
