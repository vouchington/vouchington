import { beforeAll, describe, it, expect } from 'vitest'
import {
  createTestUser,
  createTestUserDirect,
  suspendTestUser,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { assertEligibleForIdentityVerification } from '../eligibility.mts'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'

describe('assertEligibleForIdentityVerification', () => {
  let eligibleUser: PrivateUser

  beforeAll(async () => {
    // createTestUser produces a user with a verified non-disposable email (@voucha.ai)
    eligibleUser = await createTestUser()
  })

  it('passes for an eligible user with verified email', async () => {
    await expect(assertEligibleForIdentityVerification(eligibleUser)).resolves.toBeUndefined()
  })

  it('throws 403 for a suspended user', async () => {
    const user = await createTestUser()
    await suspendTestUser(user.id, 'test suspension')
    const suspended = (await getPrivateUserByAny(user.id))!
    await expect(assertEligibleForIdentityVerification(suspended)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('throws 422 for a user with no verified email', async () => {
    // createTestUserDirect inserts a user without an email address
    const user = await createTestUserDirect({ noUsername: false })
    await expect(assertEligibleForIdentityVerification(user)).rejects.toMatchObject({
      status: 422,
      code: EMAIL_VERIFICATION_REQUIRED,
      message: /verified non-disposable email/i,
    })
  })

  it('throws 409 when user is already verified', async () => {
    const user = await createTestUser()
    await setUserVerificationFields(user.id, { verificationStatus: 'verified' })
    const updated = (await getPrivateUserByAny(user.id))!
    await expect(assertEligibleForIdentityVerification(updated)).rejects.toMatchObject({
      status: 409,
      message: /already verified/i,
    })
  })

  it('passes for a user with payment_pending status (DB claim guard handles active sessions)', async () => {
    const user = await createTestUser()
    await setUserVerificationFields(user.id, { verificationStatus: 'payment_pending' })
    const updated = (await getPrivateUserByAny(user.id))!
    await expect(assertEligibleForIdentityVerification(updated)).resolves.toBeUndefined()
  })

  it('throws 409 when identity verification is already in progress', async () => {
    const user = await createTestUser()
    await setUserVerificationFields(user.id, { verificationStatus: 'identity_pending' })
    const updated = (await getPrivateUserByAny(user.id))!
    await expect(assertEligibleForIdentityVerification(updated)).rejects.toMatchObject({
      status: 409,
      message: /already in progress/i,
    })
  })

  it('throws 409 with contact-support message for duplicate_id status', async () => {
    const user = await createTestUser()
    await setUserVerificationFields(user.id, { verificationStatus: 'duplicate_id' })
    const updated = (await getPrivateUserByAny(user.id))!
    await expect(assertEligibleForIdentityVerification(updated)).rejects.toMatchObject({
      status: 409,
      message: /contact support/i,
    })
  })
})
