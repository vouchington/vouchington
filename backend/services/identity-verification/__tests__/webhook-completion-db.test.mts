import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  setUserVerificationFields,
  getUserVerificationState,
  countVerifiedIdentities,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import { onVerificationSessionVerified } from '../webhook-completion.mts'

type VerificationResult = {
  documentNumber?: string
  documentType?: string
  firstName?: string
  fullName?: string
  issuingCountry?: string
  lastName?: string
  outcome: 'failed' | 'requires_input' | 'verified'
}

const mockGetVerificationResult = vi.fn<(sessionId: string) => Promise<VerificationResult>>()
const mockFingerprint =
  vi.fn<
    (input: { documentNumber: string; documentType: string; issuingCountry: string }) => string
  >()
const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()

function makeFingerprint(): string {
  return v7().replaceAll('-', '').padEnd(64, '0')
}

describe('onVerificationSessionVerified', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerificationResult.mockResolvedValue({
      outcome: 'verified',
      firstName: 'Alice',
      lastName: 'Smith',
      fullName: 'Alice Smith',
      documentNumber: 'X1234',
      issuingCountry: 'US',
      documentType: 'passport',
    } as never)
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('inserts a verified_identities row and sets status to verified', async () => {
    const user = await createTestUser()
    const fingerprint = makeFingerprint()
    mockFingerprint.mockReturnValue(fingerprint)
    const sessionId = `vs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
    })

    await onVerificationSessionVerified(
      'evt_1',
      {
        id: sessionId,
        metadata: { user_id: user.id, checkout_session_id: 'cs_abc' },
      },
      {
        computeIdentityFingerprint: mockFingerprint as never,
        getVerificationResult: mockGetVerificationResult as never,
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    const state = await getUserVerificationState(user.id)
    expect(state?.verification_status).toBe('verified')
    expect(state?.pending_verification_session_id).toBeNull()
    expect(await countVerifiedIdentities(user.id)).toBe(1)
  })

  it('persists verified name fields', async () => {
    const user = await createTestUser()
    const fingerprint = makeFingerprint()
    mockFingerprint.mockReturnValue(fingerprint)
    const sessionId = `vs_${v7()}`
    const checkoutSessionId = `cs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
      pendingCheckoutSessionId: checkoutSessionId,
    })

    await onVerificationSessionVerified(
      'evt_1',
      {
        id: sessionId,
        metadata: { user_id: user.id },
      },
      {
        computeIdentityFingerprint: mockFingerprint as never,
        getVerificationResult: mockGetVerificationResult as never,
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    const state = await getUserVerificationState(user.id)
    expect(state?.verified_first_name).toBe('Alice')
    expect(state?.verified_last_name_initial).toBe('S')
    expect(state?.verified_full_name).toBe('Alice Smith')
  })

  it('sets duplicate_id status when the same fingerprint is already active on another account', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()
    const fingerprint = makeFingerprint()
    mockFingerprint.mockReturnValue(fingerprint)

    const session1 = `vs_${v7()}`
    const checkout1 = `cs_${v7()}`
    await setUserVerificationFields(user1.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: session1,
      pendingCheckoutSessionId: checkout1,
    })
    await onVerificationSessionVerified(
      'evt_1',
      {
        id: session1,
        metadata: { user_id: user1.id },
      },
      {
        computeIdentityFingerprint: mockFingerprint as never,
        getVerificationResult: mockGetVerificationResult as never,
        invalidateUsers: mockInvalidateUsers as never,
      },
    )
    expect((await getUserVerificationState(user1.id))?.verification_status).toBe('verified')

    const session2 = `vs_${v7()}`
    const checkout2 = `cs_${v7()}`
    await setUserVerificationFields(user2.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: session2,
      pendingCheckoutSessionId: checkout2,
    })
    await onVerificationSessionVerified(
      'evt_2',
      {
        id: session2,
        metadata: { user_id: user2.id },
      },
      {
        computeIdentityFingerprint: mockFingerprint as never,
        getVerificationResult: mockGetVerificationResult as never,
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    const state2 = await getUserVerificationState(user2.id)
    expect(state2?.verification_status).toBe('duplicate_id')
    expect(state2?.pending_verification_session_id).toBeNull()
    expect(await countVerifiedIdentities(user2.id)).toBe(0)
  })

  it('is idempotent on re-delivery with the same session ID', async () => {
    const user = await createTestUser()
    const fingerprint = makeFingerprint()
    mockFingerprint.mockReturnValue(fingerprint)
    const sessionId = `vs_${v7()}`
    const checkoutSessionId = `cs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
      pendingCheckoutSessionId: checkoutSessionId,
    })

    const eventData = { id: sessionId, metadata: { user_id: user.id } }
    await onVerificationSessionVerified('evt_1', eventData, {
      computeIdentityFingerprint: mockFingerprint as never,
      getVerificationResult: mockGetVerificationResult as never,
      invalidateUsers: mockInvalidateUsers as never,
    })
    await onVerificationSessionVerified('evt_1', eventData, {
      computeIdentityFingerprint: mockFingerprint as never,
      getVerificationResult: mockGetVerificationResult as never,
      invalidateUsers: mockInvalidateUsers as never,
    })

    expect(await countVerifiedIdentities(user.id)).toBe(1)
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('verified')
  })

  it('sets verification_status to failed when field extraction fails (outcome = failed)', async () => {
    mockGetVerificationResult.mockResolvedValue({ outcome: 'failed' } as never)
    const user = await createTestUser()
    const sessionId = `vs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: sessionId,
    })

    await onVerificationSessionVerified(
      'evt_1',
      {
        id: sessionId,
        metadata: { user_id: user.id },
      },
      {
        computeIdentityFingerprint: mockFingerprint as never,
        getVerificationResult: mockGetVerificationResult as never,
        invalidateUsers: mockInvalidateUsers as never,
      },
    )

    const state = await getUserVerificationState(user.id)
    expect(state?.verification_status).toBe('failed')
    expect(state?.pending_verification_session_id).toBeNull()
    expect(await countVerifiedIdentities(user.id)).toBe(0)
  })
})
