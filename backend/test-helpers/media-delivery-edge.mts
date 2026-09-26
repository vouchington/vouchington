import { vi } from 'vitest'
import * as provider from '../modules/aws/media-delivery-registry.mts'

/** Condition-enforcing external edge double; AWS command construction is tested by its module. */
export function installTestMediaDeliveryEdge() {
  vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
  vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
  vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-delivery-registry')
  vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
  vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
  type Record = Parameters<typeof provider.putMediaDeliveryRegistryRecord>[0]
  const records = new Map<string, Record>()
  function accept(input: Record) {
    const current = records.get(input.deliveryKey)
    if (current) {
      const sameGenerationRetry =
        input.generation === current.generation && input.state === current.state
      if (!(BigInt(input.generation) > BigInt(current.generation) || sameGenerationRetry))
        throw new Error('Stale edge generation')
    }
    records.set(input.deliveryKey, input)
  }
  const put = vi
    .spyOn(provider, 'putMediaDeliveryRegistryRecord')
    .mockImplementation(async input => {
      accept(input)
      return { $metadata: {} }
    })
  const invalidate = vi
    .spyOn(provider, 'invalidateMediaDeliveryPath')
    .mockResolvedValue({ $metadata: {} })
  return { records, accept, put, invalidatePath: invalidate }
}
