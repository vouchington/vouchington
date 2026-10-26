import { randomUUID } from 'node:crypto'
import {
  Environment,
  InAppOwnershipType,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { describe, expect, it } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import {
  createTestAppleVerificationFixture,
  submitTestAppleVerification,
} from '@voucha/test-helpers/apple-membership-verification'
import { createMembership } from '../create.mts'
import { getMembershipByUserId } from '../index.mts'
import { getMembershipVerification } from '../verifications.mts'
import { processAppleMembershipVerification } from './process-verification.mts'

describe('Apple verification after another direct source wins admission', () => {
  it('records a conflict and preserves the current entitlement on replay', async () => {
    const user = await createTestUser()
    const fixture = await createTestAppleVerificationFixture(user.id)
    const coveringSku = await createTestSku({ plan: 'pro' })
    const covering = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: coveringSku.id,
      stripeSubscriptionId: `sub_apple_conflict_${randomUUID()}`,
    })
    const verification = await submitTestAppleVerification(
      user.id,
      fixture,
      `signed-${randomUUID()}`,
    )
    const transaction: JWSTransactionDecodedPayload = {
      originalTransactionId: `original-${randomUUID()}`,
      transactionId: `transaction-${randomUUID()}`,
      bundleId: fixture.applicationId,
      productId: fixture.providerProductId,
      purchaseDate: Date.now() - 1000,
      expiresDate: Date.now() + 86_400_000,
      signedDate: Date.now(),
      environment: Environment.SANDBOX,
      inAppOwnershipType: InAppOwnershipType.PURCHASED,
      appAccountToken: fixture.purchaseIntentId,
    }
    let verifierCalls = 0
    const dependencies = {
      createVerifier: () => ({
        verifyAndDecodeTransaction: async () => {
          verifierCalls++
          return transaction
        },
      }),
    }
    await processAppleMembershipVerification(verification.id, dependencies)
    const completedCalls = verifierCalls
    await processAppleMembershipVerification(verification.id, dependencies)
    expect(verifierCalls).toBe(completedCalls)
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'conflict',
      reason_code: 'competing_direct_source',
    })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      id: covering.id,
      plan: 'pro',
      status: 'active',
    })
  })
})
