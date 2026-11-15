import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getUserVerificationState,
  setUserVerificationFields,
  softDeleteUser,
} from '@voucha/test-helpers'
import { createIdentityPendingUser } from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import { createPaymentPendingUser } from '@voucha/test-helpers/services/identity-verification/payment-pending-fixtures'
import {
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
} from '../attempts.mts'
import { onVerificationSessionCanceled } from '../event-session-terminal.mts'

describe('identity cancellation ownership', () => {
  it('resolves a redacted event through its attempt owner and leaves foreign pointers alone', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const other = await createTestUser()
    await setUserVerificationFields(other.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
    })

    await onVerificationSessionCanceled(crypto.randomUUID(), { id: sessionId, metadata: {} })
    await expect(getUserVerificationState(user.id)).resolves.toMatchObject({
      verification_status: 'unverified',
      pending_verification_session_id: null,
    })
    await expect(getUserVerificationState(other.id)).resolves.toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })
    await onVerificationSessionCanceled(crypto.randomUUID(), { id: sessionId })
    await expect(getUserVerificationState(other.id)).resolves.toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })
  })

  it('requires persisted provider ownership before acting on a pending pointer', async () => {
    const { user, checkoutSessionId } = await createPaymentPendingUser()
    const sessionId = `vs_${crypto.randomUUID()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
    })
    await onVerificationSessionCanceled(crypto.randomUUID(), { id: sessionId })
    await expect(getUserVerificationState(user.id)).resolves.toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: sessionId,
    })

    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, sessionId)
    await onVerificationSessionCanceled(crypto.randomUUID(), { id: sessionId })
    await expect(getUserVerificationState(user.id)).resolves.toMatchObject({
      verification_status: 'unverified',
      pending_verification_session_id: null,
    })
  })

  it('does not clear a newer pending session or a deleted owner', async () => {
    const current = await createIdentityPendingUser()
    const newerSessionId = `vs_${crypto.randomUUID()}`
    await setUserVerificationFields(current.user.id, {
      pendingVerificationSessionId: newerSessionId,
    })
    await onVerificationSessionCanceled(crypto.randomUUID(), { id: current.sessionId })
    await expect(getUserVerificationState(current.user.id)).resolves.toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: newerSessionId,
    })

    const deleted = await createIdentityPendingUser()
    await softDeleteUser(deleted.user.id)
    await onVerificationSessionCanceled(crypto.randomUUID(), { id: deleted.sessionId })
    await expect(getUserVerificationState(deleted.user.id)).resolves.toMatchObject({
      verification_status: 'identity_pending',
      pending_verification_session_id: deleted.sessionId,
    })
  })
})
