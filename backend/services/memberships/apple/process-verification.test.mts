import { randomUUID } from 'node:crypto'
import {
  Environment,
  InAppOwnershipType,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipVerification,
} from '@services/memberships'
import {
  createTestLaunchedNativeMembershipPurchaseIntent,
  createTestMembershipProviderLineage,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
  getTestMembershipProviderLineageAccountId,
  claimTestMembershipVerification,
  getTestMembershipVerificationProcessingState,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import type { AppleTransactionVerifier } from './types.mts'
import { processMembershipVerification } from './process-verification.mts'

describe('Apple membership verification processing', () => {
  it('projects and finalizes valid direct Apple evidence for its launched purchase intent', async () => {
    const user = await createTestUser()
    const fixture = await createAppleVerificationFixture(user.id)
    const verification = await submitAppleVerification(
      user.id,
      fixture,
      `signed-direct-${randomUUID()}`,
    )
    await processMembershipVerification(verification.id, {
      createVerifier: () => makeVerifier(fixture, { appAccountToken: fixture.purchaseIntentId }),
    })
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'verified',
      reason_code: 'verified',
    })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ plan: 'plus' })
  })
  it('finalizes a new idempotency attempt from previously verified evidence', async () => {
    const user = await createTestUser()
    const fixture = await createAppleVerificationFixture(user.id)
    const evidence = { signed_transaction_info: `signed-replay-${randomUUID()}` }
    const first = await submitAppleVerification(user.id, fixture, evidence.signed_transaction_info)
    await processMembershipVerification(first.id, {
      createVerifier: () => makeVerifier(fixture, { appAccountToken: fixture.purchaseIntentId }),
    })
    const replay = await submitAppleVerification(user.id, fixture, evidence.signed_transaction_info)
    await processMembershipVerification(replay.id, {
      createVerifier: () => {
        throw new Error('finalized evidence must not be verified again')
      },
    })
    await expect(getMembershipVerification(user.id, replay.id)).resolves.toMatchObject({
      status: 'verified',
      reason_code: 'verified',
    })
  })
  it('replays a prior rejected attempt with its stable rejection result', async () => {
    const user = await createTestUser()
    const fixture = await createAppleVerificationFixture(user.id)
    const evidence = { signed_transaction_info: `signed-rejected-replay-${randomUUID()}` }
    const first = await submitAppleVerification(user.id, fixture, evidence.signed_transaction_info)
    await processMembershipVerification(first.id, {
      createVerifier: () => makeVerifier(fixture, { bundleId: 'other.application' }),
    })
    const replay = await submitAppleVerification(user.id, fixture, evidence.signed_transaction_info)
    await processMembershipVerification(replay.id, {
      createVerifier: () => {
        throw new Error('rejected evidence must not be verified again')
      },
    })
    await expect(getMembershipVerification(user.id, replay.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'wrong_application',
    })
  })
  it.each([
    ['wrong application', { bundleId: 'other.application' }, 'wrong_application'],
    ['wrong product', { productId: 'other.product' }, 'wrong_product'],
    ['forged evidence', undefined, 'invalid_evidence'],
  ] as const)(
    'rejects %s without projecting an entitlement',
    async (_name, transaction, reasonCode) => {
      const user = await createTestUser()
      const fixture = await createAppleVerificationFixture(user.id)
      const verification = await submitAppleVerification(
        user.id,
        fixture,
        `signed-rejected-${randomUUID()}`,
      )

      await processMembershipVerification(verification.id, {
        createVerifier: () =>
          transaction
            ? makeVerifier(fixture, { ...transaction, appAccountToken: fixture.purchaseIntentId })
            : makeVerifier(fixture, {}, new Error('signature rejected')),
      })

      await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
        status: 'rejected',
        reason_code: reasonCode,
      })
      await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
    },
  )

  it('conflicts cross-account direct evidence without granting the second account access', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const applicationId = `ai.voucha.apple-owner-${randomUUID()}`
    const first = await createAppleVerificationFixture(firstUser.id, applicationId)
    const second = await createAppleVerificationFixture(secondUser.id, applicationId)
    const lineageId = `original-transaction-${randomUUID()}`

    const firstVerification = await submitAppleVerification(
      firstUser.id,
      first,
      `signed-first-${randomUUID()}`,
    )
    await processMembershipVerification(firstVerification.id, {
      createVerifier: () =>
        makeVerifier(first, {
          appAccountToken: first.purchaseIntentId,
          originalTransactionId: lineageId,
        }),
    })

    const secondVerification = await submitAppleVerification(
      secondUser.id,
      second,
      `signed-second-${randomUUID()}`,
    )
    await processMembershipVerification(secondVerification.id, {
      createVerifier: () =>
        makeVerifier(second, {
          appAccountToken: second.purchaseIntentId,
          originalTransactionId: lineageId,
        }),
    })

    await expect(
      getMembershipVerification(secondUser.id, secondVerification.id),
    ).resolves.toMatchObject({
      status: 'conflict',
      reason_code: 'wrong_account',
    })
    await expect(getMembershipByUserId(secondUser.id)).resolves.toBeNull()
  })

  it('rejects a family transaction submitted for a launched direct purchase', async () => {
    const user = await createTestUser()
    const fixture = await createAppleVerificationFixture(user.id)
    const verification = await submitAppleVerification(
      user.id,
      fixture,
      `signed-family-with-intent-${randomUUID()}`,
    )

    await processMembershipVerification(verification.id, {
      createVerifier: () =>
        makeVerifier(fixture, { inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED }),
    })

    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'wrong_account',
    })
  })

  it('fills a notification-first lineage account token exactly once', async () => {
    const user = await createTestUser()
    const fixture = await createAppleVerificationFixture(user.id)
    const providerLineageId = `notification-first-${randomUUID()}`
    const sourceIdentity = {
      provider: 'apple_app_store' as const,
      environment: 'test' as const,
      applicationId: fixture.applicationId,
      providerLineageId,
    }
    await createTestMembershipProviderLineage(sourceIdentity)
    const verification = await submitAppleVerification(
      user.id,
      fixture,
      `signed-notification-first-${randomUUID()}`,
    )

    await processMembershipVerification(verification.id, {
      createVerifier: () =>
        makeVerifier(fixture, {
          appAccountToken: fixture.purchaseIntentId,
          originalTransactionId: providerLineageId,
        }),
    })

    await expect(getTestMembershipProviderLineageAccountId(sourceIdentity)).resolves.toBe(
      fixture.purchaseIntentId,
    )
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'verified',
    })
  })

  it('fences a fresh claim and defers a retryable verifier construction failure', async () => {
    const user = await createTestUser()
    const fixture = await createAppleVerificationFixture(user.id)
    const fenced = await submitAppleVerification(user.id, fixture, `signed-fenced-${randomUUID()}`)
    const retryable = await submitAppleVerification(
      user.id,
      fixture,
      `signed-retry-${randomUUID()}`,
    )
    const claimToken = randomUUID()
    await claimTestMembershipVerification(fenced.id, claimToken)

    await processMembershipVerification(fenced.id, {
      createVerifier: () => makeVerifier(fixture),
    })
    await processMembershipVerification(retryable.id, {
      createVerifier: () => {
        throw new Error('temporary verifier configuration failure')
      },
    })

    await expect(getTestMembershipVerificationProcessingState(fenced.id)).resolves.toMatchObject({
      processing_claim_token: claimToken,
      processing_attempts: 0,
    })
    await expect(getTestMembershipVerificationProcessingState(retryable.id)).resolves.toMatchObject(
      {
        processing_claim_token: null,
        processing_attempts: 1,
        last_error: 'apple_verification_retry',
        next_processing_at: expect.any(Date),
      },
    )
  })
})

async function createAppleVerificationFixture(
  userId: string,
  applicationId = `ai.voucha.apple-${randomUUID()}`,
) {
  const sku = await createTestSku({ plan: 'plus' })
  const providerProductId = `ai.voucha.plus.${randomUUID()}`
  const providerProduct = await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'apple_app_store',
    environment: 'test',
    applicationId,
    providerProductId,
  })
  const purchaseIntentId = await createTestLaunchedNativeMembershipPurchaseIntent({
    userId,
    membershipProviderProductId: providerProduct.id,
  })
  return { applicationId, providerProductId, purchaseIntentId }
}

async function submitAppleVerification(
  userId: string,
  fixture: { purchaseIntentId: string },
  signedTransactionInfo: string,
) {
  return createMembershipVerification({
    userId,
    provider: 'apple_app_store',
    purchaseIntentId: fixture.purchaseIntentId,
    idempotencyKey: randomUUID(),
    evidence: { signed_transaction_info: signedTransactionInfo },
  })
}

function makeVerifier(
  fixture: { applicationId: string; providerProductId: string },
  overrides: Partial<JWSTransactionDecodedPayload> = {},
  error?: Error,
): AppleTransactionVerifier {
  return {
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      if (error) throw error
      return {
        originalTransactionId: `original-transaction-${randomUUID()}`,
        transactionId: `transaction-${randomUUID()}`,
        bundleId: fixture.applicationId,
        productId: fixture.providerProductId,
        purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
        expiresDate: Date.parse('2026-10-01T00:00:00.000Z'),
        signedDate: Date.parse('2026-09-01T00:00:00.000Z'),
        environment: Environment.SANDBOX,
        inAppOwnershipType: InAppOwnershipType.PURCHASED,
        ...overrides,
      }
    },
  }
}
