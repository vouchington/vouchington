import { getSiteOrigin } from '@modules/utils'

// The only place `username` is allowed to appear in a federation-facing identifier: the WebFinger
// `acct:` alias remote servers resolve to discover the actor's real (userId-based) URI. Actor
// identity itself never uses username — see actor-uris.mts.
export function getWebfingerAcct(username: string): string {
  return `acct:${username}@${new URL(getSiteOrigin()).hostname}`
}

const WEBFINGER_ACCT_PATTERN = /^acct:([^@]+)@(.+)$/

export function parseWebfingerAcct(
  resource: string,
): { username: string; hostname: string } | undefined {
  const match = WEBFINGER_ACCT_PATTERN.exec(resource)
  if (!match) return undefined
  return { username: match[1]!, hostname: match[2]! }
}
