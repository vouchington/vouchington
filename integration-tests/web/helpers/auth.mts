import { createDeviceAndSessionTokens } from '../../../backend/services/jwt-session/index.mts'
import { mintUUIDv7 } from '../../../ts-shared/session-jwt/index.mts'

export async function createTestAuthCookies(userId: string): Promise<Record<string, string>> {
  const did = mintUUIDv7()
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did,
    uid: userId,
  })

  return {
    dt: deviceToken.token,
    st: sessionToken.token,
  }
}
