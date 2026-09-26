import type { IncomingMessage } from 'node:http'

const authenticatedOriginRequests = new WeakSet<IncomingMessage>()

export function markAuthenticatedOriginRequest(request: IncomingMessage): void {
  authenticatedOriginRequests.add(request)
}

export function isAuthenticatedOriginRequest(request: IncomingMessage): boolean {
  return authenticatedOriginRequests.has(request)
}
