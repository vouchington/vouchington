import { timingSafeCredentialMatch } from './timing-safe-credential-match.mts'

export type BasicAuthCredentialList =
  | { status: 'absent' }
  | {
      status: 'configured'
      source: string
      credentials: Set<string>
      hasMalformedEntries: boolean
    }

export type RequiredBasicAuthDecision = 'authorized' | 'misconfigured' | 'unauthorized'

export const INTERNAL_REFERENCE_BASIC_AUTH_CHALLENGE =
  'Basic realm="Voucha Internal References", charset="UTF-8"'

const credentialListCache = new Map<string, BasicAuthCredentialList>()

export function readBasicAuthCredentialList(envValue: string | undefined): BasicAuthCredentialList {
  if (!envValue || envValue.trim() === '') return { status: 'absent' }

  const cached = credentialListCache.get(envValue)
  if (cached !== undefined) return cached

  const credentials = new Set<string>()
  let hasMalformedEntries = false
  for (const rawEntry of envValue.split(',')) {
    const entry = rawEntry
    const colonIndex = entry.indexOf(':')
    if (entry === '' || colonIndex <= 0 || colonIndex === entry.length - 1) {
      hasMalformedEntries = true
      continue
    }
    credentials.add(entry)
  }

  const result: BasicAuthCredentialList = {
    status: 'configured',
    source: envValue,
    credentials,
    hasMalformedEntries,
  }
  credentialListCache.set(envValue, result)
  return result
}

export function basicAuthorizationMatches(
  authorization: string | null,
  credentials: Set<string>,
): boolean {
  const match = authorization?.match(/^Basic\s+([A-Za-z0-9+/]+={0,2})$/i)
  if (!match) return false

  try {
    const decoded = Uint8Array.from(atob(match[1] as string), character => character.charCodeAt(0))
    return timingSafeCredentialMatch(new TextDecoder().decode(decoded), credentials)
  } catch {
    return false
  }
}

export function requiredBasicAuthDecision(
  authorization: string | null,
  envValue: string | undefined,
): RequiredBasicAuthDecision {
  const list = readBasicAuthCredentialList(envValue)
  if (list.status === 'absent' || list.hasMalformedEntries || list.credentials.size === 0) {
    return 'misconfigured'
  }
  return basicAuthorizationMatches(authorization, list.credentials) ? 'authorized' : 'unauthorized'
}
