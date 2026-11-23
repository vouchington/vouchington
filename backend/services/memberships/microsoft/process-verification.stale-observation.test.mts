import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { getMembershipByUserId, getMembershipSourceIdByMembershipId } from '@services/memberships'
import { createTestMicrosoftStoreFixture } from '@voucha/test-helpers/microsoft-store-fixture'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import {
  getTestMicrosoftStoreCredentials,
  getTestPendingMicrosoftStoreVerification,
} from '@voucha/test-helpers/microsoft-store-memberships'
import { createMembershipVerification } from '../verifications.mts'
import { processWithMicrosoftStore } from '@voucha/test-helpers/microsoft-store-provider-stub'
import { reconcileMicrosoftStoreSource } from './source-recovery.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft Store stale observations', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('retains fresh account keys without rolling back current-source metadata', async () => {
    const fixture = await createTestMicrosoftStoreFixture()
    const recurrenceId = `recurrence-${randomUUID()}`
    const initialRevision = new Date(Date.now() - 2_000)
    const currentRevision = new Date(Date.now() - 1_000)
    const freshKeyTime = new Date(Date.now() + 2_000)
    const freshCollectionsKey = testKey('collections', fixture, freshKeyTime)
    const freshPurchaseKey = testKey('purchase', fixture, freshKeyTime)
    const initialExpiry = new Date(Date.now() + 10 * 86_400_000)
    const currentExpiry = new Date(Date.now() + 30 * 86_400_000)

    await verify(fixture, initialExpiry, recurrenceId, initialRevision, 'collection-initial')
    await verify(fixture, currentExpiry, recurrenceId, currentRevision, 'collection-current')
    await verify(fixture, initialExpiry, recurrenceId, initialRevision, 'collection-initial', {
      collections_store_id_key: freshCollectionsKey,
      purchase_store_id_key: freshPurchaseKey,
    })

    await expect(
      getTestMicrosoftStoreCredentials({
        userId: fixture.user.id,
        applicationId: fixture.applicationId,
      }),
    ).resolves.toEqual({ collectionItemId: 'collection-current', lastVerifiedEndAt: currentExpiry })
    const membership = await getMembershipByUserId(fixture.user.id)
    const sourceId = membership && (await getMembershipSourceIdByMembershipId(membership.id))
    if (!sourceId) throw new Error('Microsoft Store source was not projected')
    const recoveryClient = client(
      fixture,
      currentExpiry,
      recurrenceId,
      currentRevision,
      'collection-current',
    )
    const collections = vi.spyOn(recoveryClient, 'queryCollections')
    const recurrences = vi.spyOn(recoveryClient, 'queryRecurrences')

    await reconcileMicrosoftStoreSource({ sourceId })
    const recoveryId = await getTestPendingMicrosoftStoreVerification({
      userId: fixture.user.id,
      applicationId: fixture.applicationId,
    })
    if (!recoveryId) throw new Error('Microsoft Store recovery verification was not admitted')
    await expect(memberships.getJob(recoveryId)).resolves.toMatchObject({
      name: 'processMembershipVerification',
      data: { verificationId: recoveryId },
    })
    await processWithMicrosoftStore(recoveryId, recoveryClient)
    await (await memberships.getJob(recoveryId))?.remove()

    expect(collections).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: freshCollectionsKey }),
    )
    expect(recurrences).toHaveBeenLastCalledWith(expect.objectContaining({ key: freshPurchaseKey }))
  })
})

function testKey(
  kind: 'collections' | 'purchase',
  fixture: Awaited<ReturnType<typeof createTestMicrosoftStoreFixture>>,
  now: Date,
): string {
  return createTestMicrosoftStoreIdKey({
    kind,
    clientId: fixture.clientId,
    userId: fixture.user.id,
    now,
    nonce: randomUUID(),
  })
}

async function verify(
  fixture: Awaited<ReturnType<typeof createTestMicrosoftStoreFixture>>,
  expiry: Date,
  recurrenceId: string,
  revision: Date,
  collectionItemId: string,
  evidence: Record<string, string> = {},
): Promise<void> {
  const verification = await createMembershipVerification({
    userId: fixture.user.id,
    provider: 'microsoft_store',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: { environment: 'test', applicationId: fixture.applicationId },
    evidence: {
      collections_store_id_key: testKey('collections', fixture, new Date()),
      purchase_store_id_key: testKey('purchase', fixture, new Date()),
      publisher_user_id: fixture.user.id,
      product_id: fixture.productId,
      sku_id: fixture.skuId,
      ...evidence,
    },
  })
  await processWithMicrosoftStore(
    verification.id,
    client(fixture, expiry, recurrenceId, revision, collectionItemId),
  )
}

function client(
  fixture: Awaited<ReturnType<typeof createTestMicrosoftStoreFixture>>,
  expiresAt: Date,
  recurrenceId: string,
  modifiedAt: Date,
  collectionItemId: string,
): MicrosoftStoreClient {
  return {
    queryCollections: async () => [
      {
        id: collectionItemId,
        recurrenceData: recurrenceId,
        modifiedDate: modifiedAt.toISOString(),
        productId: fixture.productId,
        skuId: fixture.skuId,
        endDate: expiresAt.toISOString(),
        status: 'Active',
      },
    ],
    queryRecurrences: async () => [
      {
        id: recurrenceId,
        productId: fixture.productId,
        skuId: fixture.skuId,
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: expiresAt.toISOString(),
        lastModified: modifiedAt.toISOString(),
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}
