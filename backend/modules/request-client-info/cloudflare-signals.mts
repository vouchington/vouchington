import type { IncomingMessage } from 'node:http'
import { isAuthenticatedOriginRequest } from './authenticated-origin.mts'

/** Optional Cloudflare metadata is trusted only after the origin-secret boundary validated. */
export function getTrustedClientJa4(request: IncomingMessage): string | undefined {
  const value = request.headers['x-voucha-client-ja4']
  return isAuthenticatedOriginRequest(request) && typeof value === 'string' && value.length > 0
    ? value
    : undefined
}
