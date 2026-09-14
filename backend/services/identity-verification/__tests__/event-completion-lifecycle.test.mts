import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  setUserVerificationFields,
  insertTestVerifiedIdentity,
  getUserVerificationState,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import {
  onVerificationSessionRequiresInput,
  onVerificationSessionCanceled,
} from '../event-session-lifecycle.mts'

const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()

function makeFingerprint(): string {
  return v7().replaceAll('-', '').padEnd(64, '0')
}

describe('onVerificationSessionRequiresInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('keeps user in identity_pending and invalidates cache (requires_input is recoverable)', async () => {
    const user = await createTestUser()
    const sessionId = `vs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
    })

    await onVerificationSessionRequiresInput(
      'evt_1',
      {
        id: sessionId,
        metadata: { user_id: user.id },
      },
      {
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    const state = await getUserVerificationState(user.id)
    expect(state?.verification_status).toBe('identity_pending')
    expect(state?.pending_verification_session_id).toBe(sessionId)
    expect(mockInvalidateUsers).toHaveBeenCalledWith(user.id)
  })

  it('no-ops when user is not identity_pending', async () => {
    const user = await createTestUser()
    await onVerificationSessionRequiresInput(
      'evt_1',
      {
        id: `vs_${v7()}`,
        metadata: { user_id: user.id },
      },
      {
        invalidateUsers: mockInvalidateUsers as never,
      },
    )
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
  })
})

describe('onVerificationSessionCanceled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('resets verification_status to unverified, clears verification_provider and pending session', async () => {
    const user = await createTestUser()
    const sessionId = `vs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      verificationProvider: 'stripe_identity',
      pendingVerificationSessionId: sessionId,
    })

    await onVerificationSessionCanceled(
      'evt_1',
      {
        id: sessionId,
        metadata: { user_id: user.id },
      },
      {
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    const state = await getUserVerificationState(user.id)
    expect(state?.verification_status).toBe('unverified')
    expect(state?.verification_provider).toBeNull()
    expect(state?.pending_verification_session_id).toBeNull()
  })

  it('no-ops when user is not identity_pending', async () => {
    const user = await createTestUser()
    await insertTestVerifiedIdentity(user.id, makeFingerprint(), `vs_${v7()}`)
    await setUserVerificationFields(user.id, { verificationStatus: 'verified' })

    await onVerificationSessionCanceled(
      'evt_1',
      {
        id: `vs_${v7()}`,
        metadata: { user_id: user.id },
      },
      {
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('verified')
  })
})
