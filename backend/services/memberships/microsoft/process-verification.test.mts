import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId, getMembershipSourceIdByMembershipId } from '@services/memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import { reconcileMicrosoftStoreSource } from './source-recovery.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft Store membership verification', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('projects corroborated state and ignores client-supplied key expiry', async () => {
    const fixture = await createFixture()
    const expiresAt = new Date(Date.now() + 30 * 86_400_000)
    const verification = await fixture.submit({
      collections_expires_at: new Date(0).toISOString(),
      purchase_expires_at: new Date(0).toISOString(),
    })
    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: clientFixture(fixture.productId, fixture.skuId, expiresAt),
    })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
      expires_at: expiresAt,
    })
  })

  it('rejects a Store ID key bound to another account before provider access', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit({
      collections_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'collections',
        clientId: fixture.clientId,
        userId: randomUUID(),
      }),
    })
    const client = clientFixture(
      fixture.productId,
      fixture.skuId,
      new Date(Date.now() + 86_400_000),
    )
    const collections = vi.spyOn(client, 'queryCollections')

    await processMicrosoftStoreMembershipVerification(verification.id, { client })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'invalid_evidence',
    })
    expect(collections).not.toHaveBeenCalled()
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('accepts rotated keys on the same recurrence lineage and applies a later revocation', async () => {
    const fixture = await createFixture()
    const recurrenceId = `recurrence-${randomUUID()}`
    const activeExpiry = new Date(Date.now() + 30 * 86_400_000)
    const first = await fixture.submit()
    await processMicrosoftStoreMembershipVerification(first.id, {
      client: clientFixture(fixture.productId, fixture.skuId, activeExpiry, { recurrenceId }),
    })
    const renewedExpiry = new Date(Date.now() + 60 * 86_400_000)
    const rotated = await fixture.submit()
    await processMicrosoftStoreMembershipVerification(rotated.id, {
      client: clientFixture(fixture.productId, fixture.skuId, renewedExpiry, {
        recurrenceId,
        modifiedAt: new Date(Date.now() + 1_000),
      }),
    })
    await expect(getMembershipVerification(fixture.user.id, rotated.id)).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      status: 'active',
      expires_at: renewedExpiry,
    })

    const revoked = await fixture.submit()
    await processMicrosoftStoreMembershipVerification(revoked.id, {
      client: clientFixture(fixture.productId, fixture.skuId, renewedExpiry, {
        recurrenceId,
        modifiedAt: new Date(Date.now() + 2_000),
        collectionStatus: 'Revoked',
        collectionEndAt: new Date(Date.now() - 1_000),
      }),
    })
    await expect(getMembershipVerification(fixture.user.id, revoked.id)).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('keeps newer account keys when the same observation finishes with older keys afterward', async () => {
    const fixture = await createFixture()
    const recurrenceId = `recurrence-${randomUUID()}`
    const revision = new Date()
    const freshKeyTime = new Date(Date.now() + 2_000)
    const staleKeyTime = new Date(Date.now() - 2_000)
    const freshCollectionsKey = createTestMicrosoftStoreIdKey({
      kind: 'collections',
      clientId: fixture.clientId,
      userId: fixture.user.id,
      now: freshKeyTime,
      nonce: randomUUID(),
    })
    const freshPurchaseKey = createTestMicrosoftStoreIdKey({
      kind: 'purchase',
      clientId: fixture.clientId,
      userId: fixture.user.id,
      now: freshKeyTime,
      nonce: randomUUID(),
    })
    const staleCollectionsKey = createTestMicrosoftStoreIdKey({
      kind: 'collections',
      clientId: fixture.clientId,
      userId: fixture.user.id,
      now: staleKeyTime,
      nonce: randomUUID(),
    })
    const stalePurchaseKey = createTestMicrosoftStoreIdKey({
      kind: 'purchase',
      clientId: fixture.clientId,
      userId: fixture.user.id,
      now: staleKeyTime,
      nonce: randomUUID(),
    })
    const expiry = new Date(Date.now() + 30 * 86_400_000)
    const fresh = await fixture.submit({
      collections_store_id_key: freshCollectionsKey,
      purchase_store_id_key: freshPurchaseKey,
    })
    await processMicrosoftStoreMembershipVerification(fresh.id, {
      client: clientFixture(fixture.productId, fixture.skuId, expiry, {
        recurrenceId,
        modifiedAt: revision,
      }),
    })
    const stale = await fixture.submit({
      collections_store_id_key: staleCollectionsKey,
      purchase_store_id_key: stalePurchaseKey,
    })
    await processMicrosoftStoreMembershipVerification(stale.id, {
      client: clientFixture(fixture.productId, fixture.skuId, expiry, {
        recurrenceId,
        modifiedAt: revision,
      }),
    })
    const membership = await getMembershipByUserId(fixture.user.id)
    if (!membership) throw new Error('Microsoft Store membership was not projected')
    const sourceId = await getMembershipSourceIdByMembershipId(membership.id)
    if (!sourceId) throw new Error('Microsoft Store source was not projected')
    const recoveryClient = clientFixture(fixture.productId, fixture.skuId, expiry, { recurrenceId })
    const collections = vi.spyOn(recoveryClient, 'queryCollections')
    const recurrences = vi.spyOn(recoveryClient, 'queryRecurrences')

    await reconcileMicrosoftStoreSource({ sourceId, client: recoveryClient })

    expect(collections).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: freshCollectionsKey }),
    )
    expect(recurrences).toHaveBeenLastCalledWith(expect.objectContaining({ key: freshPurchaseKey }))
  })
})

async function createFixture() {
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
  return {
    user,
    applicationId,
    productId,
    skuId,
    clientId,
    submit: (overrides = {}) =>
      submitMicrosoftStoreVerification({
        user,
        applicationId,
        productId,
        skuId,
        clientId,
        overrides,
      }),
  }
}

function submitMicrosoftStoreVerification(options: {
  user: Awaited<ReturnType<typeof createTestUser>>
  applicationId: string
  productId: string
  skuId: string | null
  clientId: string
  overrides: Record<string, unknown>
}) {
  return createMembershipVerification({
    userId: options.user.id,
    provider: 'microsoft_store',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: { environment: 'test', applicationId: options.applicationId },
    evidence: {
      collections_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'collections',
        clientId: options.clientId,
        userId: options.user.id,
        nonce: randomUUID(),
      }),
      purchase_store_id_key: createTestMicrosoftStoreIdKey({
        kind: 'purchase',
        clientId: options.clientId,
        userId: options.user.id,
        nonce: randomUUID(),
      }),
      publisher_user_id: options.user.id,
      product_id: options.productId,
      sku_id: options.skuId,
      ...options.overrides,
    },
  })
}

function clientFixture(
  productId: string,
  skuId: string | null,
  expiresAt: Date,
  options: {
    recurrenceId?: string
    modifiedAt?: Date
    collectionStatus?: 'Active' | 'Expired' | 'Revoked' | 'Banned'
    collectionEndAt?: Date
  } = {},
): MicrosoftStoreClient {
  const itemId = `collection-${randomUUID()}`
  const recurrenceId = options.recurrenceId ?? `recurrence-${randomUUID()}`
  const modifiedAt = options.modifiedAt ?? new Date()
  const collectionStatus = options.collectionStatus ?? 'Active'
  const collectionEndAt = options.collectionEndAt ?? expiresAt
  return {
    queryCollections: async () => [
      {
        id: itemId,
        recurrenceData: recurrenceId,
        modifiedDate: modifiedAt.toISOString(),
        productId,
        ...(skuId === null ? {} : { skuId }),
        endDate: collectionEndAt.toISOString(),
        status: collectionStatus,
      },
    ],
    queryRecurrences: async () => [
      {
        id: recurrenceId,
        productId,
        ...(skuId === null ? {} : { skuId }),
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: expiresAt.toISOString(),
        lastModified: modifiedAt.toISOString(),
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}
