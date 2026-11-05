import { randomUUID } from 'node:crypto'
import {
  createTestNativeMembershipProviderProduct,
  createTestUnprojectedProviderObservation,
  createTestSku,
} from '@voucha/test-helpers'

export async function createAppleObservationFixture(
  userId: string,
  plan: 'plus' | 'pro',
  sourceKind: 'direct' | 'family',
  options: { effectiveAt?: Date; providerOrder?: number; providerRevision?: string } = {},
) {
  const applicationId = `com.voucha.provider-projection.${randomUUID()}`
  const sku = await createTestSku({ plan })
  const providerProduct = await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'apple_app_store',
    environment: 'test',
    applicationId,
    providerProductId: `apple-product-${randomUUID()}`,
  })
  const observation = await createTestUnprojectedProviderObservation({
    applicationId,
    effectiveAt: options.effectiveAt,
    membershipProductId: sku.id,
    membershipProviderProductId: providerProduct.id,
    provider: 'apple_app_store',
    providerOrder: options.providerOrder,
    providerRevision: options.providerRevision,
    sourceKind,
    userId,
  })
  return { observation, providerProduct, sku }
}
