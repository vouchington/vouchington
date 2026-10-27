import { v7 } from 'uuid'
import { createDeviceAndSessionTokens } from '../services/jwt-session/index.mts'
import {
  withActiveAccountSession,
  type AccountChangeSession,
} from '../services/mfa/active-account-session.mts'
import { createReAuthToken, verifyAndDeleteReAuthToken } from '../services/mfa/re-auth.mts'

/** Mint a real current authority, including the browser binding used by account mutations. */
export async function createTestAccountChangeActor(currentUserId: string) {
  const tokens = await createDeviceAndSessionTokens({
    uid: currentUserId,
    did: v7(),
    deviceContext: {
      user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36',
    },
  })
  return {
    ...tokens,
    session: { sid: tokens.sessionToken.payload.sid, did: tokens.deviceToken.payload.did },
  }
}

export function createTestAccountChangeProof(currentUserId: string, session: AccountChangeSession) {
  return withActiveAccountSession(currentUserId, session, query =>
    createReAuthToken(currentUserId, session, query),
  )
}

export function consumeTestAccountChangeProof(
  currentUserId: string,
  session: AccountChangeSession,
  token: string,
) {
  return withActiveAccountSession(currentUserId, session, query =>
    verifyAndDeleteReAuthToken(currentUserId, session, token, query),
  )
}
