import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { createTestSku } from './entities/memberships.mts'
import { createTestUser } from './entities/users.mts'
import { createTestNativeMembershipProviderProduct } from './entities/memberships-skus.mts'

/** A user, Microsoft Store application and product; stubs the client id env, so pair with `vi.unstubAllEnvs`. */
export async function createTestMicrosoftStoreFixture() {
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
  return { user, applicationId, productId, skuId, clientId }
}
