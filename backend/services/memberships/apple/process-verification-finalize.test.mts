import { randomUUID } from 'node:crypto'
import {
  Environment,
  InAppOwnershipType,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipVerification } from '@services/memberships'
import { processMembershipVerification } from '@services/memberships/process-verification'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestAppleVerificationFixture,
  submitTestAppleVerification,
} from '@voucha/test-helpers/apple-membership-verification'
import { processAppleMembershipVerification } from './process-verification.mts'
import type { AppleTransactionVerifier } from './types.mts'

describe('Apple verification prior-attempt finalization', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('does not replay a configuration rejection after configuration is restored', async () => {
    const user = await createTestUser()
    const fixture = await createTestAppleVerificationFixture(
      user.id,
      `ai.voucha.apple-production-${randomUUID()}`,
      'production',
    )
    const signedTransactionInfo = `signed-config-recovery-${randomUUID()}`
    const first = await submitTestAppleVerification(user.id, fixture, signedTransactionInfo)
    vi.stubEnv('APPLE_APP_STORE_APP_ID', undefined)

    await processMembershipVerification(first.id)
    await expect(getMembershipVerification(user.id, first.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'provider_unavailable',
    })

    const replay = await submitTestAppleVerification(user.id, fixture, signedTransactionInfo)
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '123456789')
    await processAppleMembershipVerification(replay.id, {
      createVerifier: () => makeProductionVerifier(fixture),
    })

    await expect(getMembershipVerification(user.id, replay.id)).resolves.toMatchObject({
      status: 'verified',
      reason_code: 'verified',
    })
    await expect(getMembershipVerification(user.id, first.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'provider_unavailable',
    })
  })
})

function makeProductionVerifier(fixture: {
  applicationId: string
  providerProductId: string
  purchaseIntentId: string
}): AppleTransactionVerifier {
  return {
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      return {
        appAccountToken: fixture.purchaseIntentId,
        originalTransactionId: `original-transaction-${randomUUID()}`,
        transactionId: `transaction-${randomUUID()}`,
        bundleId: fixture.applicationId,
        productId: fixture.providerProductId,
        purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
        expiresDate: Math.floor(performance.timeOrigin) + 30 * 86_400_000,
        signedDate: Date.parse('2026-09-01T00:00:00.000Z'),
        environment: Environment.PRODUCTION,
        inAppOwnershipType: InAppOwnershipType.PURCHASED,
      }
    },
  }
}
