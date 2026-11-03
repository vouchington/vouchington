import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  countVerifiedIdentities,
  createTestUser,
  getStoredVerifiedIdentityHash,
  getUserVerificationState,
  insertTestVerifiedIdentity,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import {
  createIdentityPendingUser,
  observeUserCacheInvalidations,
} from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import { loseVerificationStatusBeforeFinalUpdateForTest } from '@voucha/test-helpers/services/identity-verification/verification-status-race'
import { v7 } from 'uuid'
import { onVerificationSessionVerified } from '../event-completion.mts'
import { runVerifiedIdentityTransaction } from '../event-completion-txn.mts'

function makeFingerprint(): string {
  return v7().replaceAll('-', '').padEnd(64, '0')
}

describe('runVerifiedIdentityTransaction races', () => {
  it('discards an unverified new fingerprint after a lost final update so a later attempt can verify', async () => {
    const { user, sessionId: firstSession } = await createIdentityPendingUser()
    const fingerprint = makeFingerprint()
    onTestFinished(loseVerificationStatusBeforeFinalUpdateForTest(user.id))

    const outcome = await runVerifiedIdentityTransaction(
      firstSession,
      user.id,
      fingerprint,
      'Alice',
      'Smith',
      'Alice Smith',
    )

    expect(outcome).toBe('noop')
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('failed')
    expect(await countVerifiedIdentities(user.id)).toBe(0)
    expect(await getStoredVerifiedIdentityHash(fingerprint)).toBeNull()

    const secondSession = `vs_${v7()}`
    await setUserVerificationFields(user.id, {
      verificationStatus: 'identity_pending',
      pendingVerificationSessionId: secondSession,
    })
    expect(
      await runVerifiedIdentityTransaction(
        secondSession,
        user.id,
        fingerprint,
        'Alice',
        'Smith',
        'Alice Smith',
      ),
    ).toBe('verified')
    expect(await getStoredVerifiedIdentityHash(fingerprint)).toEqual(
      Buffer.from(fingerprint, 'hex'),
    )
  })

  it('sets duplicate_id when another account inserts the same hash after the collision check', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const winner = await createTestUser()
    const fingerprint = makeFingerprint()
    onTestFinished(
      runBeforePostgresStatementForTest('onVerificationSessionVerified:insert', async () => {
        await insertTestVerifiedIdentity(winner.id, fingerprint, `vs_${v7()}`)
      }),
    )

    const outcome = await runVerifiedIdentityTransaction(
      sessionId,
      user.id,
      fingerprint,
      'Alice',
      'Smith',
      'Alice Smith',
    )

    expect(outcome).toBe('duplicate')
    expect(await getUserVerificationState(user.id)).toMatchObject({
      verification_status: 'duplicate_id',
      pending_verification_session_id: null,
      pending_checkout_session_id: null,
    })
    expect(await countVerifiedIdentities(user.id)).toBe(0)
    expect(await countVerifiedIdentities(winner.id)).toBe(1)
  })

  it('treats a concurrent delivery of the same session as verified, not duplicate_id', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const fingerprint = makeFingerprint()
    onTestFinished(
      runBeforePostgresStatementForTest('onVerificationSessionVerified:insert', async () => {
        await insertTestVerifiedIdentity(user.id, fingerprint, sessionId)
      }),
    )

    const outcome = await runVerifiedIdentityTransaction(
      sessionId,
      user.id,
      fingerprint,
      'Alice',
      'Smith',
      'Alice Smith',
    )

    expect(outcome).toBe('verified')
    expect(await countVerifiedIdentities(user.id)).toBe(1)
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('identity_pending')
  })
})

describe('onVerificationSessionVerified races', () => {
  it('leaves a user who left identity_pending alone when the failed update matches no row', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    const getVerificationResult = vi.fn<(sessionId: string) => Promise<{ outcome: 'failed' }>>(
      async () => ({ outcome: 'failed' }),
    )
    onTestFinished(
      runBeforePostgresStatementForTest(
        'onVerificationSessionVerified:extract-failed',
        async () => {
          await setUserVerificationFields(user.id, {
            verificationStatus: 'unverified',
            pendingVerificationSessionId: null,
          })
        },
      ),
    )
    const invalidations = observeUserCacheInvalidations()

    await onVerificationSessionVerified(
      'evt_1',
      { id: sessionId, metadata: { user_id: user.id } },
      { getVerificationResult },
    )

    expect(getVerificationResult).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
    expect(invalidations.forUser(user.id)).toEqual([])
  })
})
