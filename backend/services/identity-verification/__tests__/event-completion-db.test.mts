import { describe, expect, it, vi } from 'vitest'
import {
  countVerifiedIdentities,
  createTestUser,
  getStoredVerifiedIdentityHash,
  getTestUserRaw,
  getUserVerificationState,
  insertTestVerifiedIdentity,
  setUserVerificationFields,
} from '@voucha/test-helpers'
import { rejectNextBackgroundJobAddForTest } from '@voucha/test-helpers/injected-failures'
import {
  createIdentityPendingUser,
  makeVerifiedResult,
  observeUserCacheInvalidations,
  observeUserElectionFanOuts,
  stubIdentityFingerprintSecret,
  USER_ELECTION_FAN_OUT_JOB_NAME,
} from '@voucha/test-helpers/services/identity-verification/event-verified-fixtures'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { v7 } from 'uuid'
import { onVerificationSessionVerified } from '../event-completion.mts'
import { computeIdentityFingerprint } from '../fingerprint.mts'
import type { stripeIdentityProvider } from '../stripe-identity.mts'

type VerificationResult = Awaited<ReturnType<typeof stripeIdentityProvider.getVerificationResult>>

function deliver(
  eventData: Record<string, unknown>,
  result: VerificationResult,
  eventId = 'evt_1',
) {
  const getVerificationResult = vi.fn<(sessionId: string) => Promise<VerificationResult>>(
    async () => result,
  )
  return {
    getVerificationResult,
    done: onVerificationSessionVerified(eventId, eventData, { getVerificationResult }),
  }
}

async function verifyOnce(userId: string, sessionId: string, result: VerificationResult) {
  const { done } = deliver({ id: sessionId, metadata: { user_id: userId } }, result)
  await done
}

describe('onVerificationSessionVerified', () => {
  it('stores the hash and name fields, then refreshes weight, elections and caches', async () => {
    stubIdentityFingerprintSecret()
    const { user, sessionId } = await createIdentityPendingUser()
    const result = makeVerifiedResult()
    const invalidations = observeUserCacheInvalidations()
    const fanOuts = observeUserElectionFanOuts()

    const { getVerificationResult, done } = deliver(
      { id: sessionId, metadata: { user_id: user.id, checkout_session_id: 'cs_abc' } },
      result,
    )
    await done

    expect(getVerificationResult).toHaveBeenCalledExactlyOnceWith(sessionId)
    const state = await getUserVerificationState(user.id)
    expect(state).toMatchObject({
      verification_status: 'verified',
      pending_verification_session_id: null,
      pending_checkout_session_id: null,
      verified_first_name: 'Alice',
      verified_last_name_initial: 'S',
      verified_full_name: 'Alice Smith',
    })
    expect(await countVerifiedIdentities(user.id)).toBe(1)
    const fingerprint = computeIdentityFingerprint(result)
    expect(await getStoredVerifiedIdentityHash(fingerprint)).toEqual(
      Buffer.from(fingerprint, 'hex'),
    )
    expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    expect(fanOuts.forUser(user.id)).toEqual([{ userId: user.id, cursor: null }])
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('sets duplicate_id when the same document is already active on another account', async () => {
    stubIdentityFingerprintSecret()
    const first = await createIdentityPendingUser()
    const second = await createIdentityPendingUser()
    const result = makeVerifiedResult()
    await verifyOnce(first.user.id, first.sessionId, result)
    expect((await getUserVerificationState(first.user.id))?.verification_status).toBe('verified')
    const invalidations = observeUserCacheInvalidations()
    const fanOuts = observeUserElectionFanOuts()

    await verifyOnce(second.user.id, second.sessionId, result)

    expect(await getUserVerificationState(second.user.id)).toMatchObject({
      verification_status: 'duplicate_id',
      pending_verification_session_id: null,
      pending_checkout_session_id: null,
    })
    expect(await countVerifiedIdentities(second.user.id)).toBe(0)
    expect(fanOuts.forUser(second.user.id)).toEqual([])
    expect(invalidations.forUser(second.user.id)).toEqual([[second.user.id]])
  })

  it('rejects a document after its first account was deleted while retaining only the hash', async () => {
    stubIdentityFingerprintSecret()
    const result = makeVerifiedResult()
    const priorUser = await createTestUser()
    const fingerprint = computeIdentityFingerprint(result)
    await insertTestVerifiedIdentity(priorUser.id, fingerprint, `vs_${v7()}`)
    await setUserVerificationFields(priorUser.id, { verificationStatus: 'verified' })
    await deleteUserAndDrainForTest(priorUser, priorUser)
    const next = await createIdentityPendingUser()

    await verifyOnce(next.user.id, next.sessionId, result)

    expect((await getUserVerificationState(next.user.id))?.verification_status).toBe('duplicate_id')
    expect(await countVerifiedIdentities(next.user.id)).toBe(0)
  })

  it('replays a delivery by repeating the refreshes without a second Stripe read or link', async () => {
    stubIdentityFingerprintSecret()
    const { user, sessionId } = await createIdentityPendingUser()
    const eventData = { id: sessionId, metadata: { user_id: user.id } }
    const first = deliver(eventData, makeVerifiedResult())
    await first.done
    const firstRecalculatedAt = (await getTestUserRaw(user.id))?.vote_weight_recalculated_at
    const invalidations = observeUserCacheInvalidations()
    const fanOuts = observeUserElectionFanOuts()

    const replay = deliver(eventData, makeVerifiedResult())
    await replay.done

    expect(replay.getVerificationResult).not.toHaveBeenCalled()
    expect(firstRecalculatedAt).toBeInstanceOf(Date)
    expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at?.getTime()).toBeGreaterThan(
      firstRecalculatedAt?.getTime() ?? Infinity,
    )
    expect(await countVerifiedIdentities(user.id)).toBe(1)
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('verified')
    expect(fanOuts.forUser(user.id)).toEqual([{ userId: user.id, cursor: null }])
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('repairs the election enqueue on a retry after the queue was unavailable', async () => {
    stubIdentityFingerprintSecret()
    const { user, sessionId } = await createIdentityPendingUser()
    const eventData = { id: sessionId, metadata: { user_id: user.id } }
    const restore = rejectNextBackgroundJobAddForTest(
      USER_ELECTION_FAN_OUT_JOB_NAME,
      new Error('temporary queue outage'),
    )

    const failed = deliver(eventData, makeVerifiedResult())
    await expect(failed.done).rejects.toThrow('temporary queue outage')
    restore()
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('verified')
    const failedRecalculatedAt = (await getTestUserRaw(user.id))?.vote_weight_recalculated_at
    const invalidations = observeUserCacheInvalidations()
    const fanOuts = observeUserElectionFanOuts()

    const retry = deliver(eventData, makeVerifiedResult(), 'evt_2')
    await retry.done

    expect(failed.getVerificationResult).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect(retry.getVerificationResult).not.toHaveBeenCalled()
    expect(failedRecalculatedAt).toBeInstanceOf(Date)
    expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at?.getTime()).toBeGreaterThan(
      failedRecalculatedAt?.getTime() ?? Infinity,
    )
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
    expect(fanOuts.forUser(user.id)).toEqual([{ userId: user.id, cursor: null }])
  })

  it('repairs committed side effects when the retry has redacted metadata', async () => {
    stubIdentityFingerprintSecret()
    const { user, sessionId } = await createIdentityPendingUser()
    await verifyOnce(user.id, sessionId, makeVerifiedResult())
    const firstRecalculatedAt = (await getTestUserRaw(user.id))?.vote_weight_recalculated_at
    const invalidations = observeUserCacheInvalidations()
    const fanOuts = observeUserElectionFanOuts()

    const retry = deliver({ id: sessionId, metadata: {} }, makeVerifiedResult(), 'evt_retry')
    await retry.done

    expect(retry.getVerificationResult).not.toHaveBeenCalled()
    expect(firstRecalculatedAt).toBeInstanceOf(Date)
    expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at?.getTime()).toBeGreaterThan(
      firstRecalculatedAt?.getTime() ?? Infinity,
    )
    expect(fanOuts.forUser(user.id)).toEqual([{ userId: user.id, cursor: null }])
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it.each(['failed', 'requires_input'] as const)(
    'moves the user to failed and invalidates when the outcome is %s',
    async outcome => {
      const { user, sessionId } = await createIdentityPendingUser()
      const invalidations = observeUserCacheInvalidations()
      const fanOuts = observeUserElectionFanOuts()

      const { getVerificationResult, done } = deliver(
        { id: sessionId, metadata: { user_id: user.id } },
        { outcome },
      )
      await done

      expect(getVerificationResult).toHaveBeenCalledExactlyOnceWith(sessionId)
      expect(await getUserVerificationState(user.id)).toMatchObject({
        verification_status: 'failed',
        pending_verification_session_id: null,
        pending_checkout_session_id: null,
      })
      expect(await countVerifiedIdentities(user.id)).toBe(0)
      expect(fanOuts.forUser(user.id)).toEqual([])
      expect(invalidations.forUser(user.id)).toEqual([[user.id]])
    },
  )

  it('looks the user up by session id when metadata.user_id is absent', async () => {
    stubIdentityFingerprintSecret()
    const { user, sessionId } = await createIdentityPendingUser()
    const invalidations = observeUserCacheInvalidations()

    await deliver({ id: sessionId, metadata: {} }, makeVerifiedResult()).done

    expect((await getUserVerificationState(user.id))?.verification_status).toBe('verified')
    expect(invalidations.forUser(user.id)).toEqual([[user.id]])
  })

  it('does nothing when the session id is absent or matches no user', async () => {
    const { user } = await createIdentityPendingUser()
    const missingId = deliver({ metadata: { user_id: user.id } }, { outcome: 'failed' })
    const unknownSession = deliver({ id: `vs_${v7()}`, metadata: {} }, { outcome: 'failed' })
    await missingId.done
    await unknownSession.done

    expect(missingId.getVerificationResult).not.toHaveBeenCalled()
    expect(unknownSession.getVerificationResult).not.toHaveBeenCalled()
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('identity_pending')
  })

  it('does nothing when the user is not identity_pending for this session', async () => {
    const { user, sessionId } = await createIdentityPendingUser()
    await setUserVerificationFields(user.id, {
      verificationStatus: 'unverified',
      pendingVerificationSessionId: null,
    })
    const invalidations = observeUserCacheInvalidations()

    const { getVerificationResult, done } = deliver(
      { id: sessionId, metadata: { user_id: user.id } },
      { outcome: 'failed' },
    )
    await done

    expect(getVerificationResult).not.toHaveBeenCalled()
    expect((await getUserVerificationState(user.id))?.verification_status).toBe('unverified')
    expect(invalidations.forUser(user.id)).toEqual([])
  })
})
