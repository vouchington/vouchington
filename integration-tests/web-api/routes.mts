import http from 'node:http'
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
