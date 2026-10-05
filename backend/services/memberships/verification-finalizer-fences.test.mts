import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import {
  createTestUser,
  expireTestMembershipVerificationLease,
  getTestMembershipProviderEvidenceTerminalState,
  getTestMembershipVerificationProcessingState,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  claimPendingMembershipVerification,
  createMembershipVerification,
  getMembershipVerification,
} from './verifications.mts'
import { getContext as googleContext } from './google/verification-context.mts'
import { getContext as microsoftContext } from './microsoft/verification-persistence.mts'
import * as google from './google/verification-persistence.mts'
import * as microsoft from './microsoft/verification-outcomes.mts'
import { deferPendingGooglePlayVerification } from './google/verification-finalization.mts'
import { getClaimedAppleVerification } from './apple/process-verification-context.mts'
import { finalizeAppleVerification } from './apple/process-verification-finalize.mts'

const providers = [
  { provider: 'google_play', context: googleContext, outcomes: google },
  { provider: 'microsoft_store', context: microsoftContext, outcomes: microsoft },
] as const

describe('membership verification finalizer ownership', () => {
  it.each(providers)(
    '$provider rolls back stale finalizers and preserves the successor',
    async entry => {
      const fixture = await pendingVerification(entry.provider)
      const context = await (async () => {
        await using query = await beginTransaction()
        return await entry.context(fixture.verification.id, fixture.claim.leaseToken, query)
      })()
      if (!context) throw new Error('Expected claimed provider context')
      const successor = await takeOver(fixture.verification.id)

      for (const disposition of ['verify', 'reject'] as const) {
        await (async () => {
          await using query = await beginTransaction()
          const completion =
            disposition === 'verify'
              ? entry.outcomes.finalizeVerified(context, fixture.claim.leaseToken, query)
              : entry.outcomes.reject(context, fixture.claim.leaseToken, 'invalid_evidence', query)
          await expect(completion).rejects.toThrow('claim was superseded')
        })()
        await expect(
          getMembershipVerification(fixture.user.id, fixture.verification.id),
        ).resolves.toMatchObject({
          status: 'pending',
          reason_code: null,
        })
        await expect(
          getTestMembershipProviderEvidenceTerminalState(context.evidenceId),
        ).resolves.toMatchObject({
          verified_at: null,
          rejected_at: null,
          rejection_reason: null,
          observation_count: 0,
        })
        await expect(
          getTestMembershipVerificationProcessingState(fixture.verification.id),
        ).resolves.toMatchObject({
          lease_token: successor.leaseToken,
          last_error: null,
        })
      }
    },
  )

  it('preserves the successor when a stale Google worker defers pending work', async () => {
    const fixture = await pendingVerification('google_play')
    const context = await (async () => {
      await using query = await beginTransaction()
      return await googleContext(fixture.verification.id, fixture.claim.leaseToken, query)
    })()
    if (!context) throw new Error('Expected claimed Google context')
    const successor = await takeOver(fixture.verification.id)
    await (async () => {
      await using query = await beginTransaction()
      await expect(
        deferPendingGooglePlayVerification(context, fixture.claim.leaseToken, query),
      ).rejects.toThrow('claim was superseded')
    })()
    await expect(
      getTestMembershipVerificationProcessingState(fixture.verification.id),
    ).resolves.toMatchObject({ lease_token: successor.leaseToken, last_error: null })
  })

  it('allows only the current Microsoft owner to terminalize a conflict', async () => {
    const fixture = await pendingVerification('microsoft_store')
    const successor = await takeOver(fixture.verification.id)
    await microsoft.terminalizeConflict(
      fixture.verification.id,
      fixture.claim.leaseToken,
      'wrong_account',
    )
    await expect(
      getMembershipVerification(fixture.user.id, fixture.verification.id),
    ).resolves.toMatchObject({ status: 'pending' })
    await microsoft.terminalizeConflict(
      fixture.verification.id,
      successor.leaseToken,
      'wrong_account',
    )
    await expect(
      getMembershipVerification(fixture.user.id, fixture.verification.id),
    ).resolves.toMatchObject({ status: 'conflict', reason_code: 'wrong_account' })
    await expect(
      getTestMembershipVerificationProcessingState(fixture.verification.id),
    ).resolves.toMatchObject({ lease_token: null })
  })

  it('rejects an Apple finalizer after successor takeover', async () => {
    const fixture = await pendingVerification('apple_app_store')
    const context = await (async () => {
      await using query = await beginTransaction()
      return await getClaimedAppleVerification(
        fixture.verification.id,
        fixture.claim.leaseToken,
        query,
      )
    })()
    if (!context) throw new Error('Expected claimed Apple context')
    const successor = await takeOver(fixture.verification.id)
    await (async () => {
      await using query = await beginTransaction()
      await expect(
        finalizeAppleVerification(context, fixture.claim.leaseToken, 'verified', 'verified', query),
      ).rejects.toThrow('claim was superseded')
    })()
    await expect(
      getMembershipVerification(fixture.user.id, fixture.verification.id),
    ).resolves.toMatchObject({ status: 'pending' })
    await expect(
      getTestMembershipVerificationProcessingState(fixture.verification.id),
    ).resolves.toMatchObject({ lease_token: successor.leaseToken })
  })
})

async function pendingVerification(
  provider: 'google_play' | 'microsoft_store' | 'apple_app_store',
) {
  const user = await createTestUser()
  const verification = await createMembershipVerification({
    userId: user.id,
    provider,
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: {
      environment: 'test',
      applicationId: `ai.voucha.fence-${randomUUID()}`,
    },
    evidence: { fixture: randomUUID() },
  })
  const claim = await claimPendingMembershipVerification(verification.id)
  if (!claim) throw new Error('Expected initial verification claim')
  return { user, verification, claim }
}

async function takeOver(id: string) {
  await expireTestMembershipVerificationLease(id)
  const claim = await claimPendingMembershipVerification(id)
  if (!claim) throw new Error('Expected successor verification claim')
  return claim
}
