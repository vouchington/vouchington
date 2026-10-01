import http from 'node:http'
import { createApiRequestGuardedListener } from '../../backend/api/app.mts'
import { buildWebClientInfoHeaders } from '@/lib/api/server/client-info'
import { createDeviceAndSessionTokens } from '../../backend/services/jwt-session/index.mts'
import { mintUUIDv7 } from '../../ts-shared/session-jwt/index.mts'
import { listenOnFetchSafeEphemeralPort } from '../web/helpers/ports.mts'

export async function listenOnFetchSafeLoopback(server: http.Server): Promise<string> {
  const port = await listenOnFetchSafeEphemeralPort(server)
  return `http://127.0.0.1:${port}`
}

export async function createWebApiTestCookieHeader(
  userId: string,
): Promise<Record<string, string>> {
  const did = mintUUIDv7()
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, uid: userId })

  return {
    Cookie: `dt=${deviceToken.token}; st=${sessionToken.token}`,
  }
}

// In-process servers retain the same request metadata boundary as the production API listener.
export function createWebApiTestServer(listener: http.RequestListener): http.Server {
  return http.createServer(createApiRequestGuardedListener(listener))
}

// Browser client requests bypass Next.js in this real-URL router. Supply the metadata that the
// production Next.js proxy assigns, while preserving the request's other headers.
export function buildWebApiTestProxyHeaders(input?: HeadersInit): Headers {
  const headers = new Headers(input)
  for (const [name, value] of Object.entries(buildWebClientInfoHeaders())) headers.set(name, value)
  return headers
}
