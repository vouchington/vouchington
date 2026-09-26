import { v7 } from 'uuid'
import { createTestUser } from '../../entities/users.mts'
import { createDeviceAndSessionTokens } from '../../../services/jwt-session/index.mts'

// Creates a test user plus a matching device/session token pair, formatted as `Cookie` header
// values ready to hand to supertest's `.set('Cookie', [dtCookie, stCookie])`. Shared by every
// cookie-authenticated route test that needs a real, verifiable dt/st pair rather than a forged
// one -- logout, session refresh/rotation, and any other route gated by `requireAuth`.
export async function createTestSessionCookies(): Promise<{
  dtCookie: string
  stCookie: string
  userId: string
  sid: string
}> {
  const user = await createTestUser()
  const sid = v7()
  const tokens = await createDeviceAndSessionTokens({ did: v7(), sid, uid: user.id })
  return {
    dtCookie: `dt=${tokens.deviceToken.token}`,
    stCookie: `st=${tokens.sessionToken.token}`,
    userId: user.id,
    sid,
  }
}
