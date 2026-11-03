import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipSourceIdByMembershipId,
} from '../services/memberships/index.mts'
import type { MicrosoftStoreClient } from '../services/memberships/microsoft/index.mts'
import { processWithMicrosoftStore } from './microsoft-store-provider-stub.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'

export async function createActiveMicrosoftStoreFixture(): Promise<{
  verificationId: string
  sourceId: string
  userId: string
  applicationId: string
}> {
  const user = await createTestUser()
  const applicationId = `voucha.microsoft.${randomUUID()}`
  const productId = `9TEST${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const skuId = '0001'
  const clientId = `microsoft-client-${randomUUID()}`
  vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', clientId)
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'microsoft_store',
    environment: 'test',
    applicationId,
    providerProductId: productId,
    skuId,
  })
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  const verification = await createMembershipVerification({
    userId: user.id,
    provider: 'microsoft_store',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: { environment: 'test', applicationId },
    evidence: {
      collections_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'collections',
        clientId,
        userId: user.id,
      }),
      purchase_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'purchase',
        clientId,
        userId: user.id,
      }),
      publisher_user_id: user.id,
      product_id: productId,
      sku_id: skuId,
    },
  })
  await processWithMicrosoftStore(verification.id, clientFixture(productId, skuId, expiresAt))
  const membership = await getMembershipByUserId(user.id)
  if (!membership) throw new Error('Microsoft Store fixture was not projected')
  const sourceId = await getMembershipSourceIdByMembershipId(membership.id)
  if (!sourceId) throw new Error('Microsoft Store fixture source was not projected')
  return { verificationId: verification.id, sourceId, userId: user.id, applicationId }
}

function clientFixture(productId: string, skuId: string, expiresAt: Date): MicrosoftStoreClient {
  const itemId = `collection-${randomUUID()}`
  const recurrenceId = `recurrence-${randomUUID()}`
  return {
    queryCollections: async () => [
      {
        id: itemId,
        recurrenceData: recurrenceId,
        modifiedDate: new Date().toISOString(),
        productId,
        skuId,
        endDate: expiresAt.toISOString(),
        status: 'Active',
      },
    ],
    queryRecurrences: async () => [
      {
        id: recurrenceId,
        productId,
        skuId,
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: expiresAt.toISOString(),
        lastModified: new Date().toISOString(),
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}
