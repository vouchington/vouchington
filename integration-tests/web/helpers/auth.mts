import { createDeviceAndSessionTokens } from '../../../backend/services/jwt-session/index.mts'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'

export async function createTestAuthCookies(
  userId: string,
  userAgent: string,
): Promise<Record<string, string>> {
  const did = mintUUIDv7()
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did,
    uid: userId,
    deviceContext: { user_agent: userAgent },
  })

  return {
    dt: deviceToken.token,
    st: sessionToken.token,
  }
}
