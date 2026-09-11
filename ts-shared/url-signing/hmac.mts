import {
  signPathWithKey as signPathWithUpstreamKey,
  verifyPathWithKey as verifyPathWithUpstreamKey,
} from '@vouchington/utils/url-signing'

const INVALID_KEY_ERROR = 'BUG: VOUCHA_SIDELOAD_SIGNING_KEYS must be 64 hex characters (32 bytes)'

function assertSigningKey(keyHex: string): void {
  if (!/^[\da-f]{64}$/i.test(keyHex)) throw new Error(INVALID_KEY_ERROR)
}

export function signPathWithKey(path: string, keyHex: string): string {
  assertSigningKey(keyHex)
  return signPathWithUpstreamKey(path, keyHex)
}

export function verifyPathWithKey(path: string, signature: string, keyHex: string): boolean {
  assertSigningKey(keyHex)
  try {
    return verifyPathWithUpstreamKey(path, signature, keyHex)
  } catch {
    return false
  }
}
