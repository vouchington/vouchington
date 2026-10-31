import { getRequestContextIdentity } from '@modules/utils/request-context'

const verifiedPairs = new WeakMap<object, Map<string, Map<string, Promise<unknown>>>>()

/**
 * The API listener and request context both check the inbound device/session pair.
 * A signature result for those exact tokens stays valid for the rest of the request.
 * Revocation and durable session authority stay outside this memo.
 */
export function memoizeRequestSessionPairVerification<T>(
  deviceToken: string,
  sessionToken: string,
  verify: () => Promise<T>,
): Promise<T> {
  const request = getRequestContextIdentity()
  if (!request) return verify()

  let byDevice = verifiedPairs.get(request)
  if (!byDevice) {
    byDevice = new Map()
    verifiedPairs.set(request, byDevice)
  }
  let bySession = byDevice.get(deviceToken)
  if (!bySession) {
    bySession = new Map()
    byDevice.set(deviceToken, bySession)
  }
  const cached = bySession.get(sessionToken) as Promise<T> | undefined
  if (cached) return cached

  const pending = verify()
  bySession.set(sessionToken, pending)
  return pending
}
