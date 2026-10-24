import type { IncomingMessage } from 'node:http'

const verifiedSessionCredentialRequests = new WeakSet<IncomingMessage>()

export function markVerifiedSessionCredential(request: IncomingMessage): void {
  verifiedSessionCredentialRequests.add(request)
}

export function hasVerifiedSessionCredential(request: IncomingMessage): boolean {
  return verifiedSessionCredentialRequests.has(request)
}
