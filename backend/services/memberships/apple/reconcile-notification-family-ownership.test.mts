import { randomUUID } from 'node:crypto'
import {
  Environment,
  InAppOwnershipType,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { createMembershipVerification, getMembershipByUserId } from '@services/memberships'
import {
  createTestMembershipProviderLineage,
  getTestMembershipProviderLineageAccountId,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { processMembershipVerification } from './process-verification.mts'
import type { AppleTransactionVerifier } from './types.mts'

describe('Apple family verification with a direct lineage owner', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('projects a family receipt without changing the existing direct owner token', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.apple-family-${randomUUID()}`
    const providerLineageId = `original-transaction-${randomUUID()}`
    const providerProductId = `ai.voucha.plus.${randomUUID()}`
    vi.stubEnv('APPLE_APP_STORE_APPLICATION_ID', applicationId)
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId,
      providerProductId,
    })
    const directOwnerToken = randomUUID()
    await createTestMembershipProviderLineage({
      provider: 'apple_app_store',
      environment: 'test',
      applicationId,
      providerLineageId,
      providerAccountId: directOwnerToken,
    })
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'apple_app_store',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { signed_transaction_info: `family-receipt-${randomUUID()}` },
    })

    await processMembershipVerification(verification.id, {
      createVerifier: () =>
        makeFamilyVerifier({ applicationId, providerLineageId, providerProductId }),
    })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ plan: 'plus' })
    await expect(
      getTestMembershipProviderLineageAccountId({
        provider: 'apple_app_store',
        environment: 'test',
        applicationId,
        providerLineageId,
      }),
    ).resolves.toBe(directOwnerToken)
  })
})

function makeFamilyVerifier(options: {
  applicationId: string
  providerLineageId: string
  providerProductId: string
}): AppleTransactionVerifier {
  return {
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      return {
        bundleId: options.applicationId,
        environment: Environment.SANDBOX,
        expiresDate: Date.now() + 86_400_000,
        inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED,
        originalTransactionId: options.providerLineageId,
        productId: options.providerProductId,
        purchaseDate: Date.now() - 86_400_000,
        signedDate: Date.now() - 60_000,
        transactionId: `family-transaction-${randomUUID()}`,
      }
    },
  }
}
