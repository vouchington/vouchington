import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  getTestMembershipProviderEvidenceTerminalState,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { createMembershipVerification, getMembershipVerification } from './verifications.mts'
import { terminalizeConflict } from './microsoft/verification-outcomes.mts'
import {
  getTestPendingProviderVerificationContext,
  finalizeTestPendingProviderVerification,
  getTestPendingAppleVerificationContext,
  finalizeTestPendingAppleVerification,
} from '@voucha/test-helpers/membership-verification-finalizers'

describe('membership verification terminal outcome guards', () => {
  it.each(['google_play', 'microsoft_store'] as const)(
    'rolls back stale %s finalizer writes after an outcome is recorded',
    async provider => {
      const { user, verification } = await pendingVerification(provider)
      const context = await getTestPendingProviderVerificationContext(provider, verification.id)
      if (!context) throw new Error('Expected pending context')
      await terminalizeConflict(verification.id, 'wrong_account')
      for (const disposition of ['verify', 'reject'] as const) {
        await expect(
          finalizeTestPendingProviderVerification(provider, context, disposition),
        ).rejects.toThrow('outcome was already recorded')
        await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
          status: 'conflict',
          reason_code: 'wrong_account',
        })
        await expect(
          getTestMembershipProviderEvidenceTerminalState(context.evidenceId),
        ).resolves.toMatchObject({ verified_at: null, rejected_at: null, observation_count: 0 })
      }
    },
  )

  it('rejects a stale Apple finalizer and preserves the recorded outcome', async () => {
    const { user, verification } = await pendingVerification('apple_app_store')
    const context = await getTestPendingAppleVerificationContext(verification.id)
    if (!context) throw new Error('Expected pending Apple context')
    await terminalizeConflict(verification.id, 'wrong_account')
    await expect(finalizeTestPendingAppleVerification(context)).rejects.toThrow(
      'outcome was already recorded',
    )
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'conflict',
      reason_code: 'wrong_account',
    })
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
      applicationId: `ai.voucha.guard-${randomUUID()}`,
    },
    evidence: { fixture: randomUUID() },
  })
  return { user, verification }
}
