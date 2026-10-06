import { randomUUID } from 'node:crypto'
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
import * as microsoft from './microsoft/verification-outcomes.mts'
import {
  getTestClaimedProviderVerificationContext,
  finalizeTestClaimedProviderVerification,
  deferTestPendingGoogleVerification,
  getTestClaimedAppleVerificationContext,
  finalizeTestClaimedAppleVerification,
} from '@voucha/test-helpers/membership-verification-finalizers'

describe('membership verification finalizer ownership', () => {
  it.each(['google_play', 'microsoft_store'] as const)(
    '%s rolls back stale finalizers and preserves the successor',
    async provider => {
      const fixture = await pendingVerification(provider)
      const context = await getTestClaimedProviderVerificationContext(
        provider,
        fixture.verification.id,
        fixture.claim.leaseToken,
      )
      if (!context) throw new Error('Expected claimed provider context')
      const successor = await takeOver(fixture.verification.id)

      for (const disposition of ['verify', 'reject'] as const) {
        await expect(
          finalizeTestClaimedProviderVerification(
            provider,
            context,
            fixture.claim.leaseToken,
            disposition,
          ),
        ).rejects.toThrow('claim was superseded')
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
    const context = await getTestClaimedProviderVerificationContext(
      'google_play',
      fixture.verification.id,
      fixture.claim.leaseToken,
    )
    if (!context) throw new Error('Expected claimed Google context')
    const successor = await takeOver(fixture.verification.id)
    await expect(
      deferTestPendingGoogleVerification(context, fixture.claim.leaseToken),
    ).rejects.toThrow('claim was superseded')
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
    const context = await getTestClaimedAppleVerificationContext(
      fixture.verification.id,
      fixture.claim.leaseToken,
    )
    if (!context) throw new Error('Expected claimed Apple context')
    const successor = await takeOver(fixture.verification.id)
    await expect(
      finalizeTestClaimedAppleVerification(context, fixture.claim.leaseToken),
    ).rejects.toThrow('claim was superseded')
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
