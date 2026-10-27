import { createDeviceAndSessionTokens } from '../../../backend/services/jwt-session/index.mts'
import { createVerifiedMfaTestSession } from '../../../backend/test-helpers/authenticated-session.mts'
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

export async function createTestMfaAuthCookies(
  userId: string,
  userAgent: string,
): Promise<Record<string, string>> {
  const { deviceToken, sessionToken } = await createVerifiedMfaTestSession(userId, {
    user_agent: userAgent,
  })
  return { dt: deviceToken.token, st: sessionToken.token }
}
