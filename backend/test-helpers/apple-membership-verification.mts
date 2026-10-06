import { randomUUID } from 'node:crypto'
import { createMembershipVerification } from '../services/memberships/verifications.mts'
import {
  createTestSku,
  createTestNativeMembershipProviderProduct,
  createTestLaunchedNativeMembershipPurchaseIntent,
} from './index.mts'

export async function createTestAppleVerificationFixture(
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

export async function submitTestAppleVerification(
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
