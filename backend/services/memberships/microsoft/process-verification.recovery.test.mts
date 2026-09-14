import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId, getMembershipSourceIdByMembershipId } from '@services/memberships'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUnprojectedProviderObservation,
  createTestUser,
  hardDeleteTestUser,
  releaseMembershipSourceForRebindForTest,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import { listTestMicrosoftStoreSourceIds } from '@voucha/test-helpers/microsoft-store-memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import { projectVerifiedProviderMembershipObservation } from '../provider-observation-projection.mts'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import { reconcileMicrosoftStoreSource } from './source-recovery.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft Store membership verification recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rebinds a released source when another user submits fresh evidence for its lineage', async () => {
    const fixture = await createFixture()
    const recurrenceId = `recurrence-${randomUUID()}`
    const first = await fixture.submit(fixture.user)
    await processMicrosoftStoreMembershipVerification(first.id, {
      client: fixture.client(recurrenceId),
    })
    const membership = await getMembershipByUserId(fixture.user.id)
    const sourceId = membership && (await getMembershipSourceIdByMembershipId(membership.id))
    if (!sourceId) throw new Error('Microsoft Store source was not projected')
    await releaseMembershipSourceForRebindForTest(sourceId)
    await hardDeleteTestUser(fixture.user.id)

    const replacementUser = await createTestUser()
    const replacement = await fixture.submit(replacementUser)
    await processMicrosoftStoreMembershipVerification(replacement.id, {
      client: fixture.client(recurrenceId),
    })

    await expect(
      getMembershipVerification(replacementUser.id, replacement.id),
    ).resolves.toMatchObject({ status: 'verified' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
    await expect(getMembershipByUserId(replacementUser.id)).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('terminally rejects decrypted evidence with malformed required fields', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit(fixture.user, { publisher_user_id: null })

    await processMicrosoftStoreMembershipVerification(verification.id, { client: fixture.client() })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'rejected', reason_code: 'invalid_evidence' })
  })

  it('leaves a verification pending when evidence decryption cannot access its configured key', async () => {
    const fixture = await createFixture()
    const verification = await fixture.submit(fixture.user)
    vi.stubEnv('VOUCHA_STORED_SECRET_ENCRYPTION_KEYS', undefined)

    await processMicrosoftStoreMembershipVerification(verification.id, { client: fixture.client() })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
  })

  it('uses fresh evidence for a later recurrence observed with the same account Store ID keys', async () => {
    const fixture = await createFixture()
    const collectionsKey = createTestMicrosoftStoreIdKey({
      kind: 'collections',
      clientId: process.env.MICROSOFT_STORE_CLIENT_ID!,
      userId: fixture.user.id,
    })
    const purchaseKey = createTestMicrosoftStoreIdKey({
      kind: 'purchase',
      clientId: process.env.MICROSOFT_STORE_CLIENT_ID!,
      userId: fixture.user.id,
    })
    const evidence = {
      collections_store_id_key: collectionsKey,
      purchase_store_id_key: purchaseKey,
    }
    const firstRecurrenceId = `recurrence-${randomUUID()}`
    const first = await fixture.submit(fixture.user, evidence)
    await processMicrosoftStoreMembershipVerification(first.id, {
      client: fixture.client(firstRecurrenceId),
    })
    const second = await fixture.submit(fixture.user, evidence)
    await processMicrosoftStoreMembershipVerification(second.id, {
      client: fixture.client(`recurrence-${randomUUID()}`),
    })

    await expect(getMembershipVerification(fixture.user.id, first.id)).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipVerification(fixture.user.id, second.id)).resolves.toMatchObject({
      status: 'verified',
    })

    const sources = await listTestMicrosoftStoreSourceIds({
      userId: fixture.user.id,
      applicationId: fixture.applicationId,
    })
    expect(sources).toHaveLength(2)
    const firstSource = sources[0]
    if (!firstSource) throw new Error('First Microsoft Store source was not persisted')
    const recoveryClient = fixture.client(firstRecurrenceId)
    const queryCollections = vi.spyOn(recoveryClient, 'queryCollections')
    await reconcileMicrosoftStoreSource({ sourceId: firstSource, client: recoveryClient })
    expect(queryCollections).toHaveBeenCalledWith(expect.objectContaining({ key: collectionsKey }))
  })

  it('retains an out-of-flow Microsoft term until the current direct source ends', async () => {
    const fixture = await createFixture()
    const coverSku = await createTestSku({ plan: 'plus' })
    const coverApplicationId = `voucha.apple.${randomUUID()}`
    const coverProduct = await createTestNativeMembershipProviderProduct({
      membershipProductId: coverSku.id,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId: coverApplicationId,
      providerProductId: `apple-${randomUUID()}`,
    })
    const effectiveAt = new Date(Date.now() - 86_400_000)
    const coverExpiry = new Date(Date.now() + 86_400_000)
    const cover = await createTestUnprojectedProviderObservation({
      userId: fixture.user.id,
      sourceKind: 'direct',
      provider: 'apple_app_store',
      applicationId: coverApplicationId,
      membershipProductId: coverSku.id,
      membershipProviderProductId: coverProduct.id,
      effectiveAt,
      expiresAt: coverExpiry,
      providerOrder: 0,
      providerRevision: 'cover',
    })
    await projectVerifiedProviderMembershipObservation({
      userId: fixture.user.id,
      membershipProviderObservationId: cover.membershipProviderObservationId,
    })
    const microsoftExpiry = new Date(Date.now() + 2 * 86_400_000)
    const verification = await fixture.submit(fixture.user)
    await processMicrosoftStoreMembershipVerification(verification.id, {
      client: fixture.client(undefined, microsoftExpiry),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'verified' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      expires_at: coverExpiry,
    })

    const terminalAt = new Date()
    const expired = await createTestUnprojectedProviderObservation({
      ...cover.sourceIdentity,
      userId: fixture.user.id,
      sourceKind: 'direct',
      membershipProductId: coverSku.id,
      membershipProviderProductId: coverProduct.id,
      status: 'expired',
      effectiveAt,
      expiresAt: terminalAt,
      terminalAt,
      providerOrder: 1,
      providerRevision: 'cover',
    })
    await projectVerifiedProviderMembershipObservation({
      userId: fixture.user.id,
      membershipProviderObservationId: expired.membershipProviderObservationId,
    })

    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      status: 'active',
      expires_at: microsoftExpiry,
    })
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
  const submit = (targetUser: Awaited<ReturnType<typeof createTestUser>>, overrides = {}) =>
    createMembershipVerification({
      userId: targetUser.id,
      provider: 'microsoft_store',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: {
        collections_store_id_key: createTestMicrosoftStoreIdKey({
          kind: 'collections',
          clientId,
          userId: targetUser.id,
          nonce: randomUUID(),
        }),
        purchase_store_id_key: createTestMicrosoftStoreIdKey({
          kind: 'purchase',
          clientId,
          userId: targetUser.id,
          nonce: randomUUID(),
        }),
        publisher_user_id: targetUser.id,
        product_id: productId,
        sku_id: skuId,
        ...overrides,
      },
    })
  return {
    user,
    applicationId,
    submit,
    client: (recurrenceId = `recurrence-${randomUUID()}`, expiresAt?: Date) =>
      client(productId, skuId, recurrenceId, expiresAt),
  }
}

function client(
  productId: string,
  skuId: string,
  recurrenceId: string,
  expiresAt = new Date(Date.now() + 30 * 86_400_000),
): MicrosoftStoreClient {
  const expiry = expiresAt.toISOString()
  const modifiedAt = new Date().toISOString()
  return {
    queryCollections: async () => [
      {
        id: `collection-${randomUUID()}`,
        recurrenceData: recurrenceId,
        modifiedDate: modifiedAt,
        productId,
        skuId,
        endDate: expiry,
        status: 'Active',
      },
    ],
    queryRecurrences: async () => [
      {
        id: recurrenceId,
        productId,
        skuId,
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: expiry,
        lastModified: modifiedAt,
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}
