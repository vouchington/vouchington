import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '@services/memberships'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import { MicrosoftStoreResponseError } from './response-error.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft Store provider verification outcomes', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('terminalizes a confirmed invalid Store ID key response', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: failingClient(new MicrosoftStoreResponseError(401, true)),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'rejected', reason_code: 'invalid_evidence' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it.each([
    ['generic 401 service authentication failure', new MicrosoftStoreResponseError(401, false)],
    ['generic 403 service authorization failure', new MicrosoftStoreResponseError(403, false)],
    ['429 throttling response', new MicrosoftStoreResponseError(429, false)],
    ['5xx service response', new MicrosoftStoreResponseError(503, false)],
    ['network timeout', new Error('Microsoft Store request timed out')],
  ] as const)('retries a %s', async (_description, error) => {
    const fixture = await createFixture()
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: failingClient(error),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('retries when a matching Recurrence is returned before Collections catches up', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: {
        queryCollections: async () => [],
        queryRecurrences: async () => [
          {
            id: `recurrence-${randomUUID()}`,
            productId: fixture.productId,
            skuId: '0001',
            startTime: new Date(Date.now() - 86_400_000).toISOString(),
            expirationTime: new Date(Date.now() + 86_400_000).toISOString(),
            lastModified: new Date().toISOString(),
            recurrenceState: 'Active',
            autoRenew: true,
          },
        ],
      },
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })
})

async function createFixture(): Promise<{
  productId: string
  submit(): ReturnType<typeof createMembershipVerification>
  user: Awaited<ReturnType<typeof createTestUser>>
}> {
  const user = await createTestUser()
  const applicationId = `voucha.microsoft.${randomUUID()}`
  const productId = `9TEST${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const clientId = `microsoft-client-${randomUUID()}`
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
  return {
    productId,
    user,
    submit: () =>
      createMembershipVerification({
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
            nonce: randomUUID(),
          }),
          purchase_store_id_key: createTestMicrosoftStoreIdKey({
            kind: 'purchase',
            clientId,
            userId: user.id,
            nonce: randomUUID(),
          }),
          publisher_user_id: user.id,
          product_id: productId,
          sku_id: '0001',
        },
      }),
  }
}

function failingClient(error: Error): MicrosoftStoreClient {
  return {
    queryCollections: async () => {
      throw error
    },
    queryRecurrences: async () => [],
  }
}
