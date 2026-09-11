import { randomUUID } from 'node:crypto'
import {
  AutoRenewStatus,
  Environment,
  InAppOwnershipType,
  Status,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { createMembershipVerification, getMembershipByUserId } from '@services/memberships'
import {
  createTestNativeMembershipProviderProduct,
  createTestLaunchedNativeMembershipPurchaseIntent,
  createTestSku,
  createTestUser,
  getTestMembershipProviderEvidenceTerminalState,
} from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ingestAppleAppStoreNotification } from './notification-ingress.mts'
import { processMembershipVerification } from './process-verification.mts'
import { reconcileAppleNotification } from './reconcile-notification.mts'
import type { AppleNotificationReconciliationVerifier } from './notification-verifier.mts'

describe('Apple notification reconciliation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps independently verified family notification evidence durable until recipients prove distinct receipts', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const fixture = await createFixture()
    const accepted = await ingestAppleAppStoreNotification({
      evidence: { signedPayload: fixture.signedPayload },
      environment: 'test',
      applicationId: fixture.applicationId,
      verifier: makeVerifier(fixture),
    })
    const historyCalls: string[] = []
    const dependencies = reconciliationDependencies(fixture, historyCalls)

    await reconcileAppleNotification(
      {
        evidenceId: accepted.evidenceId,
        providerLineageId: fixture.providerLineageId,
        environment: 'test',
      },
      dependencies,
    )
    await reconcileAppleNotification(
      {
        evidenceId: accepted.evidenceId,
        providerLineageId: fixture.providerLineageId,
        environment: 'test',
      },
      dependencies,
    )
    expect(historyCalls).toEqual([fixture.providerLineageId])
    await expect(getMembershipByUserId(firstUser.id)).resolves.toBeNull()
    await expect(getMembershipByUserId(secondUser.id)).resolves.toBeNull()

    await proveFamilyReceipt(firstUser.id, fixture, `family-receipt-${randomUUID()}`)
    await proveFamilyReceipt(secondUser.id, fixture, `family-receipt-${randomUUID()}`)

    await expect(getMembershipByUserId(firstUser.id)).resolves.toMatchObject({ plan: 'plus' })
    await expect(getMembershipByUserId(secondUser.id)).resolves.toMatchObject({ plan: 'plus' })
  })
  it('isolates a recipient revocation and cannot regress it with stale family receipt evidence', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const fixture = await createFixture()
    const firstReceipt = `family-receipt-${randomUUID()}`
    const secondReceipt = `family-receipt-${randomUUID()}`
    await proveFamilyReceipt(firstUser.id, fixture, firstReceipt)
    await proveFamilyReceipt(secondUser.id, fixture, secondReceipt)
    const revokedReceipt = `family-revoked-receipt-${randomUUID()}`

    await proveFamilyReceipt(firstUser.id, fixture, revokedReceipt, {
      revocationDate: Date.parse('2026-09-05T00:00:00.000Z'),
    })
    await proveFamilyReceipt(firstUser.id, fixture, firstReceipt)

    await expect(getMembershipByUserId(firstUser.id)).resolves.toBeNull()
    await expect(getMembershipByUserId(secondUser.id)).resolves.toMatchObject({ plan: 'plus' })
  })
  it('binds and projects direct notification evidence for its launched purchase intent', async () => {
    const user = await createTestUser()
    const fixture = await createFixture()
    const purchaseIntentId = await createTestLaunchedNativeMembershipPurchaseIntent({
      userId: user.id,
      membershipProviderProductId: fixture.membershipProviderProductId,
    })
    const verifier = makeVerifier(fixture, fixture.latestTransaction, {
      appAccountToken: purchaseIntentId,
      inAppOwnershipType: InAppOwnershipType.PURCHASED,
    })
    const accepted = await ingestAppleAppStoreNotification({
      evidence: { signedPayload: fixture.signedPayload },
      environment: 'test',
      applicationId: fixture.applicationId,
      verifier,
    })
    await expect(
      reconcileAppleNotification(
        {
          evidenceId: accepted.evidenceId,
          providerLineageId: fixture.providerLineageId,
          environment: 'test',
        },
        reconciliationDependencies(fixture, [], verifier),
      ),
    ).resolves.toBeUndefined()

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ plan: 'plus' })
  })
  it('rejects provider-valid notification evidence that is still purchase-pending', async () => {
    const fixture = await createFixture()
    const accepted = await ingestAppleAppStoreNotification({
      evidence: { signedPayload: fixture.signedPayload },
      environment: 'test',
      applicationId: fixture.applicationId,
      verifier: makeVerifier(fixture),
    })
    const verifier = makeVerifier(fixture, fixture.latestTransaction, {
      purchaseDate: Date.now() + 86_400_000,
      expiresDate: Date.now() + 172_800_000,
    })

    await expect(
      reconcileAppleNotification(
        {
          evidenceId: accepted.evidenceId,
          providerLineageId: fixture.providerLineageId,
          environment: 'test',
        },
        reconciliationDependencies(fixture, [], verifier),
      ),
    ).resolves.toBeUndefined()
    await expect(
      getTestMembershipProviderEvidenceTerminalState(accepted.evidenceId),
    ).resolves.toMatchObject({
      rejected_at: expect.any(Date),
      rejection_reason: 'invalid_evidence',
      observation_count: 0,
    })
  })
  it('rejects direct notification evidence without its launched purchase intent', async () => {
    const fixture = await createFixture()
    const verifier = makeVerifier(fixture, fixture.latestTransaction, {
      appAccountToken: randomUUID(),
      inAppOwnershipType: InAppOwnershipType.PURCHASED,
    })
    const accepted = await ingestAppleAppStoreNotification({
      evidence: { signedPayload: fixture.signedPayload },
      environment: 'test',
      applicationId: fixture.applicationId,
      verifier,
    })

    await expect(
      reconcileAppleNotification(
        {
          evidenceId: accepted.evidenceId,
          providerLineageId: fixture.providerLineageId,
          environment: 'test',
        },
        reconciliationDependencies(fixture, [], verifier),
      ),
    ).resolves.toBeUndefined()
    await expect(
      getTestMembershipProviderEvidenceTerminalState(accepted.evidenceId),
    ).resolves.toMatchObject({
      rejected_at: expect.any(Date),
      rejection_reason: 'invalid_evidence',
      observation_count: 0,
    })
  })
})

async function createFixture() {
  const applicationId = `ai.voucha.apple-reconcile-${randomUUID()}`
  vi.stubEnv('APPLE_APP_STORE_APPLICATION_ID', applicationId)
  const sku = await createTestSku({ plan: 'plus' })
  const providerProductId = `ai.voucha.plus.${randomUUID()}`
  const providerProduct = await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'apple_app_store',
    environment: 'test',
    applicationId,
    providerProductId,
  })
  return {
    applicationId,
    membershipProviderProductId: providerProduct.id,
    latestTransaction: `latest-transaction-${randomUUID()}`,
    providerLineageId: `original-transaction-${randomUUID()}`,
    providerProductId,
    signedPayload: `signed-notification-${randomUUID()}`,
    submittedTransaction: `submitted-transaction-${randomUUID()}`,
  }
}

function reconciliationDependencies(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  historyCalls: string[],
  verifier = makeVerifier(fixture),
) {
  return {
    createVerifier: () => verifier,
    createClient: () => ({
      async getTransactionHistory(transactionId: string) {
        historyCalls.push(transactionId)
        return {
          signedTransactions: [fixture.submittedTransaction, fixture.latestTransaction],
          hasMore: false,
        }
      },
      async getAllSubscriptionStatuses() {
        return {
          bundleId: fixture.applicationId,
          environment: Environment.SANDBOX,
          data: [
            {
              lastTransactions: [
                {
                  status: Status.ACTIVE,
                  originalTransactionId: fixture.providerLineageId,
                  signedTransactionInfo: fixture.latestTransaction,
                  signedRenewalInfo: 'latest-renewal',
                },
              ],
            },
          ],
        }
      },
    }),
  }
}

function makeVerifier(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  receiptTransactionId = fixture.latestTransaction,
  transaction: Partial<JWSTransactionDecodedPayload> = {},
): AppleNotificationReconciliationVerifier {
  return {
    async verifyAndDecodeNotification() {
      return {
        notificationUUID: `notification-${fixture.providerLineageId}`,
        data: {
          bundleId: fixture.applicationId,
          environment: Environment.SANDBOX,
          signedTransactionInfo: fixture.submittedTransaction,
        },
      }
    },
    async verifyAndDecodeRenewalInfo() {
      return {
        autoRenewStatus: AutoRenewStatus.ON,
        environment: Environment.SANDBOX,
        originalTransactionId: fixture.providerLineageId,
        productId: fixture.providerProductId,
      }
    },
    async verifyAndDecodeTransaction(
      signedTransactionInfo: string,
    ): Promise<JWSTransactionDecodedPayload> {
      return {
        appAccountToken: undefined,
        bundleId: fixture.applicationId,
        environment: Environment.SANDBOX,
        expiresDate: Date.parse('2026-10-01T00:00:00.000Z'),
        inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED,
        originalTransactionId: fixture.providerLineageId,
        productId: fixture.providerProductId,
        purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
        signedDate: Date.parse('2026-09-01T00:00:00.000Z'),
        transactionId:
          signedTransactionInfo === fixture.submittedTransaction
            ? fixture.submittedTransaction
            : receiptTransactionId,
        ...transaction,
      }
    },
  }
}

async function proveFamilyReceipt(
  userId: string,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  receiptTransactionId: string,
  transaction: Partial<JWSTransactionDecodedPayload> = {},
): Promise<void> {
  const verification = await createMembershipVerification({
    userId,
    provider: 'apple_app_store',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    evidence: { signed_transaction_info: receiptTransactionId },
  })
  await processMembershipVerification(verification.id, {
    createVerifier: () => makeVerifier(fixture, receiptTransactionId, transaction),
  })
}
