import assert from 'http-assert'
import type { AccountChangeSession } from '@services/mfa/active-account-session'
import { runWithTransaction } from '@data-stores/psql'
import { createReAuthToken } from '@services/mfa/re-auth'
import { verifyEmailAddressLoginToken } from './authentication.mts'

/** OTP consumption and its scoped account-change proof commit together. */
export async function completeEmailReAuth(
  currentUserId: string,
  session: AccountChangeSession,
  emailAddress: string,
  code: string,
): Promise<string> {
  // The scoped verifier acquires the live actor fences before consuming the OTP.
  return runWithTransaction(undefined, async query => {
    const result = await verifyEmailAddressLoginToken(
      emailAddress,
      code,
      { purpose: 're_auth', currentUserId, session },
      { query },
    )
    assert(result.success, 401, 'Invalid or expired verification code')
    return createReAuthToken(currentUserId, session, query)
  })
}
