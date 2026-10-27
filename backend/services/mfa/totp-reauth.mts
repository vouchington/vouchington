import assert from 'http-assert'
import { registerPostCommitAction } from '@data-stores/psql'
import { verifyTotpCode } from '@services/totp'
import { withActiveAccountSession, type AccountChangeSession } from './active-account-session.mts'
import { createReAuthToken } from './re-auth.mts'
import { clearTotpReAuthAttempts } from './re-auth-failures.mts'

export async function verifyTotpReAuth(
  currentUserId: string,
  session: AccountChangeSession,
  code: string,
): Promise<string> {
  return withActiveAccountSession(currentUserId, session, async query => {
    const valid = await verifyTotpCode(currentUserId, code, { query })
    assert(valid, 401, 'Invalid verification code')
    const token = await createReAuthToken(currentUserId, session, query)
    registerPostCommitAction(query, () => clearTotpReAuthAttempts(currentUserId))
    return token
  })
}
