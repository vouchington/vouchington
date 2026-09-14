import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '@services/memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft Store membership verification edge cases', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects evidence when Collections has no matching product', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: clientFixture(fixture, 'different-product'),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'rejected', reason_code: 'invalid_evidence' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('retries when a matching Collections record references a Recurrence not yet returned', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: clientFixture(fixture, 'missing-recurrence'),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('rejects a matching provider result with invalid authoritative state', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: clientFixture(fixture, 'malformed-expiry'),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'rejected', reason_code: 'invalid_evidence' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('releases a verification lease when Microsoft is temporarily unavailable', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit()
    let recurrenceCalls = 0

    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: {
        queryCollections: async () => {
          throw new Error('Microsoft Collections is temporarily unavailable')
        },
        queryRecurrences: async () => {
          recurrenceCalls += 1
          return []
        },
      },
    })

    expect(recurrenceCalls).toBe(1)
    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('uses the newer revoked Collections item when duplicates share a recurrence', async () => {
    const fixture = await createFixture()
    const recurrenceId = `recurrence-${randomUUID()}`
    const expiry = new Date(Date.now() + 86_400_000).toISOString()
    const client: MicrosoftStoreClient = {
      queryCollections: async () => [
        collection(fixture, recurrenceId, expiry, { modifiedAt: '2026-01-01T00:00:00Z' }),
        collection(fixture, recurrenceId, expiry, {
          id: `collection-${randomUUID()}`,
          modifiedAt: '2026-01-02T00:00:00Z',
          status: 'Revoked',
          endDate: new Date(Date.now() - 1_000).toISOString(),
        }),
      ],
      queryRecurrences: async () => [
        recurrence(fixture, recurrenceId, expiry, '2026-01-02T00:00:00Z'),
      ],
    }
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, { client })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'verified' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('selects the newest active recurrence among matching Collections records', async () => {
    const fixture = await createFixture()
    const earlierId = `recurrence-${randomUUID()}`
    const laterId = `recurrence-${randomUUID()}`
    const earlierExpiry = new Date(Date.now() + 86_400_000).toISOString()
    const laterExpiry = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const client: MicrosoftStoreClient = {
      queryCollections: async () => [
        collection(fixture, earlierId, earlierExpiry, { modifiedAt: '2026-01-01T00:00:00Z' }),
        collection(fixture, laterId, laterExpiry, { modifiedAt: '2026-01-02T00:00:00Z' }),
      ],
      queryRecurrences: async () => [
        recurrence(fixture, earlierId, earlierExpiry, '2026-01-01T00:00:00Z'),
        recurrence(fixture, laterId, laterExpiry, '2026-01-02T00:00:00Z'),
      ],
    }
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, { client })

    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      expires_at: new Date(laterExpiry),
    })
  })

  it('accepts equal concrete provider SKUs for a product-only mapping', async () => {
    const fixture = await createFixture({ skuId: null })
    const recurrenceId = `recurrence-${randomUUID()}`
    const expiry = new Date(Date.now() + 86_400_000).toISOString()
    const client: MicrosoftStoreClient = {
      queryCollections: async () => [
        { ...collection(fixture, recurrenceId, expiry), skuId: 'provider-sku' },
      ],
      queryRecurrences: async () => [
        {
          ...recurrence(fixture, recurrenceId, expiry, new Date().toISOString()),
          skuId: 'provider-sku',
        },
      ],
    }
    const verification = await fixture.submit()

    await processMicrosoftStoreMembershipVerification(verification.id, { client })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'verified' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      status: 'active',
    })
  })
})

type Fixture = {
  user: Awaited<ReturnType<typeof createTestUser>>
  applicationId: string
  productId: string
  skuId: string | null
  clientId: string
  submit(): ReturnType<typeof createMembershipVerification>
}

async function createFixture(options: { skuId?: string | null } = {}): Promise<Fixture> {
  const user = await createTestUser()
  const applicationId = `voucha.microsoft.${randomUUID()}`
  const productId = `9TEST${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const skuId = options.skuId ?? (options.skuId === null ? null : '0001')
  const clientId = `microsoft-client-${randomUUID()}`
  vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', clientId)
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'microsoft_store',
    environment: 'test',
    applicationId,
    providerProductId: productId,
    skuId: skuId ?? undefined,
  })
  return {
    user,
    applicationId,
    productId,
    skuId,
    clientId,
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
          sku_id: skuId,
        },
      }),
  }
}

function clientFixture(
  fixture: Fixture,
  mode: 'different-product' | 'missing-recurrence' | 'malformed-expiry',
): MicrosoftStoreClient {
  const recurrenceId = `recurrence-${randomUUID()}`
  const expiry = new Date(Date.now() + 86_400_000).toISOString()
  const returnedProductId =
    mode === 'different-product' ? `other-${randomUUID()}` : fixture.productId
  return {
    queryCollections: async () => [
      {
        id: `collection-${randomUUID()}`,
        recurrenceData: mode === 'missing-recurrence' ? `missing-${randomUUID()}` : recurrenceId,
        modifiedDate: new Date().toISOString(),
        productId: returnedProductId,
        skuId: fixture.skuId ?? undefined,
        endDate: expiry,
        status: 'Active',
      },
    ],
    queryRecurrences: async () => [
      {
        id: recurrenceId,
        productId: returnedProductId,
        skuId: fixture.skuId ?? undefined,
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: mode === 'malformed-expiry' ? 'malformed-expiry' : expiry,
        lastModified: new Date().toISOString(),
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}

function collection(
  fixture: Fixture,
  recurrenceId: string,
  expiry: string,
  options: {
    id?: string
    modifiedAt?: string
    status?: 'Active' | 'Expired' | 'Revoked' | 'Banned'
    endDate?: string
  } = {},
) {
  return {
    id: options.id ?? `collection-${randomUUID()}`,
    recurrenceData: recurrenceId,
    modifiedDate: options.modifiedAt ?? new Date().toISOString(),
    productId: fixture.productId,
    ...(fixture.skuId === null ? {} : { skuId: fixture.skuId }),
    endDate: options.endDate ?? expiry,
    status: options.status ?? 'Active',
  } as const
}

function recurrence(fixture: Fixture, id: string, expiry: string, modifiedAt: string) {
  return {
    id,
    productId: fixture.productId,
    ...(fixture.skuId === null ? {} : { skuId: fixture.skuId }),
    startTime: new Date(Date.now() - 86_400_000).toISOString(),
    expirationTime: expiry,
    lastModified: modifiedAt,
    recurrenceState: 'Active',
    autoRenew: true,
  } as const
}
