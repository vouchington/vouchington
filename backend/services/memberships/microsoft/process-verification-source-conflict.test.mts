import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import { getMembershipByUserId } from '../index.mts'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft verification of a lineage bound to another owner', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects the second binding without moving or duplicating the original entitlement', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const applicationId = `ai.voucha.owner-${randomUUID()}`
    const clientId = `client-${randomUUID()}`
    const productId = `product-${randomUUID()}`
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', clientId)
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'microsoft_store',
      environment: 'test',
      applicationId,
      providerProductId: productId,
      skuId: '0001',
    })
    const submit = (userId: string) =>
      createMembershipVerification({
        userId,
        provider: 'microsoft_store',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        trustedProviderContext: { environment: 'test', applicationId },
        evidence: {
          collections_store_id_key: createTestMicrosoftStoreIdKey({
            kind: 'collections',
            clientId,
            userId,
            nonce: randomUUID(),
          }),
          purchase_store_id_key: createTestMicrosoftStoreIdKey({
            kind: 'purchase',
            clientId,
            userId,
            nonce: randomUUID(),
          }),
          publisher_user_id: userId,
          product_id: productId,
          sku_id: '0001',
        },
      })
    const recurrenceId = `recurrence-${randomUUID()}`
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
    const modifiedAt = new Date().toISOString()
    const client: MicrosoftStoreClient = {
      queryCollections: async () => [
        {
          id: `collection-${randomUUID()}`,
          recurrenceData: recurrenceId,
          productId,
          skuId: '0001',
          modifiedDate: modifiedAt,
          endDate: expiresAt,
          status: 'Active',
        },
      ],
      queryRecurrences: async () => [
        {
          id: recurrenceId,
          productId,
          skuId: '0001',
          startTime: new Date(Date.now() - 86_400_000).toISOString(),
          expirationTime: expiresAt,
          lastModified: modifiedAt,
          recurrenceState: 'Active',
          autoRenew: true,
        },
      ],
    }
    const original = await submit(owner.id)
    await processMicrosoftStoreMembershipVerification(original.id, { client })
    const membership = await getMembershipByUserId(owner.id)
    expect(membership).toMatchObject({ status: 'active', plan: 'plus' })
    const competing = await submit(other.id)
    await processMicrosoftStoreMembershipVerification(competing.id, { client })
    await processMicrosoftStoreMembershipVerification(competing.id, { client })
    await expect(getMembershipVerification(other.id, competing.id)).resolves.toMatchObject({
      status: 'conflict',
      reason_code: 'wrong_account',
    })
    await expect(getMembershipByUserId(other.id)).resolves.toBeNull()
    await expect(getMembershipByUserId(owner.id)).resolves.toEqual(membership)
  })
})
