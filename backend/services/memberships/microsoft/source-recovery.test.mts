import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId, getMembershipSourceIdByMembershipId } from '@services/memberships'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestMicrosoftStoreIdKey } from '@voucha/test-helpers/microsoft-store-id-key'
import {
  countTestMicrosoftStoreVerifications,
  countTestPendingMicrosoftStoreVerifications,
  getTestPendingMicrosoftStoreVerification,
  makeTestMembershipVerificationDue,
} from '@voucha/test-helpers/microsoft-store-memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import { processMicrosoftStoreMembershipVerification } from './process-verification.mts'
import { MicrosoftStoreResponseError } from './response-error.mts'
import { reconcileMicrosoftStoreSource } from './source-recovery.mts'
import type { MicrosoftStoreClient } from './types.mts'

describe('Microsoft Store source recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reuses a deferred source recovery verification across hourly sweeps', async () => {
    const fixture = await createFixture()
    const initial = await createMembershipVerification({
      userId: fixture.user.id,
      provider: 'microsoft_store',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId: fixture.applicationId },
      evidence: fixture.evidence,
    })
    await processMicrosoftStoreMembershipVerification(initial.id, { client: fixture.activeClient })
    const membership = await getMembershipByUserId(fixture.user.id)
    const sourceId = membership && (await getMembershipSourceIdByMembershipId(membership.id))
    if (!sourceId) throw new Error('Microsoft Store source was not projected')
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const unavailable = unavailableClient()

    await reconcileMicrosoftStoreSource({ sourceId, client: unavailable })
    const recoveryContext = { userId: fixture.user.id, applicationId: fixture.applicationId }
    const firstPendingId = await getTestPendingMicrosoftStoreVerification(recoveryContext)
    if (!firstPendingId) throw new Error('Microsoft Store recovery verification was not deferred')
    await expect(getMembershipVerification(fixture.user.id, firstPendingId)).resolves.toMatchObject(
      { status: 'pending' },
    )

    now += 60 * 60 * 1000
    await reconcileMicrosoftStoreSource({ sourceId, client: unavailable })

    await expect(getTestPendingMicrosoftStoreVerification(recoveryContext)).resolves.toBe(
      firstPendingId,
    )
    await expect(countTestPendingMicrosoftStoreVerifications(recoveryContext)).resolves.toBe(1)
    expect(unavailable.queryCollections).toHaveBeenCalledOnce()

    await makeTestMembershipVerificationDue(firstPendingId)
    await processMicrosoftStoreMembershipVerification(firstPendingId, {
      client: fixture.activeClient,
    })
    now += 60 * 60 * 1000
    await reconcileMicrosoftStoreSource({ sourceId, client: fixture.activeClient })

    await expect(countTestPendingMicrosoftStoreVerifications(recoveryContext)).resolves.toBe(0)
    await expect(countTestMicrosoftStoreVerifications(recoveryContext)).resolves.toBe(3)
  })

  it('recovers a concrete Store SKU from its lineage when the product mapping is product-wide', async () => {
    const fixture = await createFixture({ mappingSkuId: null, authoritativeSkuId: 'PROVIDER-SKU' })
    const initial = await createMembershipVerification({
      userId: fixture.user.id,
      provider: 'microsoft_store',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId: fixture.applicationId },
      evidence: fixture.evidence,
    })
    await processMicrosoftStoreMembershipVerification(initial.id, { client: fixture.activeClient })
    const membership = await getMembershipByUserId(fixture.user.id)
    const sourceId = membership && (await getMembershipSourceIdByMembershipId(membership.id))
    if (!sourceId) throw new Error('Microsoft Store source was not projected')
    const renewedExpiry = new Date(fixture.expiresAt.getTime() + 86_400_000)
    const renewedClient = activeClient({
      productId: fixture.productId,
      skuId: fixture.authoritativeSkuId,
      recurrenceId: fixture.recurrenceId,
      expiresAt: renewedExpiry,
      modifiedAt: new Date(Date.now() + 1_000),
    })
    const queryCollections = vi.spyOn(renewedClient, 'queryCollections')

    await reconcileMicrosoftStoreSource({ sourceId, client: renewedClient })

    expect(queryCollections).toHaveBeenCalledOnce()
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      expires_at: renewedExpiry,
    })
    await expect(
      countTestMicrosoftStoreVerifications({
        userId: fixture.user.id,
        applicationId: fixture.applicationId,
      }),
    ).resolves.toBe(2)
  })
})

async function createFixture(
  options: { mappingSkuId?: string | null; authoritativeSkuId?: string } = {},
) {
  const user = await createTestUser()
  const applicationId = `voucha.microsoft.${randomUUID()}`
  const productId = `9TEST${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const mappingSkuId = options.mappingSkuId === undefined ? '0001' : options.mappingSkuId
  const authoritativeSkuId = options.authoritativeSkuId ?? mappingSkuId ?? '0001'
  const clientId = `microsoft-client-${randomUUID()}`
  vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', clientId)
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'microsoft_store',
    environment: 'test',
    applicationId,
    providerProductId: productId,
    skuId: mappingSkuId ?? undefined,
  })
  const recurrenceId = `recurrence-${randomUUID()}`
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  return {
    user,
    applicationId,
    productId,
    authoritativeSkuId,
    recurrenceId,
    expiresAt,
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
      sku_id: mappingSkuId,
    },
    activeClient: activeClient({ productId, skuId: authoritativeSkuId, recurrenceId, expiresAt }),
  }
}

function activeClient(options: {
  productId: string
  skuId: string
  recurrenceId: string
  expiresAt: Date
  modifiedAt?: Date
}): MicrosoftStoreClient {
  const modifiedAt = (options.modifiedAt ?? new Date()).toISOString()
  return {
    queryCollections: async () => [
      {
        id: `collection-${randomUUID()}`,
        recurrenceData: options.recurrenceId,
        modifiedDate: modifiedAt,
        productId: options.productId,
        skuId: options.skuId,
        endDate: options.expiresAt.toISOString(),
        status: 'Active',
      },
    ],
    queryRecurrences: async () => [
      {
        id: options.recurrenceId,
        productId: options.productId,
        skuId: options.skuId,
        startTime: new Date(Date.now() - 86_400_000).toISOString(),
        expirationTime: options.expiresAt.toISOString(),
        lastModified: modifiedAt,
        recurrenceState: 'Active',
        autoRenew: true,
      },
    ],
  }
}

function unavailableClient(): MicrosoftStoreClient {
  return {
    queryCollections: vi
      .fn<MicrosoftStoreClient['queryCollections']>()
      .mockRejectedValue(new MicrosoftStoreResponseError(503, false)),
    queryRecurrences: vi
      .fn<MicrosoftStoreClient['queryRecurrences']>()
      .mockRejectedValue(new MicrosoftStoreResponseError(503, false)),
  }
}
