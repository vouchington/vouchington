import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  listInvalidatedPaths,
  createOwnedCloudFrontDistribution,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import {
  invalidateMediaDeliveryPath,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'

describe('media delivery registry against the AWS Emulator', () => {
  const registryEnv = {
    MEDIA_DELIVERY_REGISTRY_TABLE: 'test-media-delivery-registry',
    MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
  }

  it('allows a same-generation retry only when the edge state matches', async () => {
    const deliveryKey = `image-placement:${randomUUID()}:image`
    const record = { deliveryKey, state: 'allow', generation: '2147483648' } as const
    await putMediaDeliveryRegistryRecord(record, registryEnv)
    await putMediaDeliveryRegistryRecord(record, registryEnv)
    await expect(
      putMediaDeliveryRegistryRecord({ ...record, state: 'withheld' }, registryEnv),
    ).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })

    expect(await readMediaDeliveryRegistryItem(deliveryKey)).toEqual({
      state: 'allow',
      generation: '2147483648',
    })
  })

  it('accepts only a newer generation over the stored edge state', async () => {
    const deliveryKey = `image-placement:${randomUUID()}:image`
    await putMediaDeliveryRegistryRecord(
      { deliveryKey, state: 'allow', generation: '2147483648' },
      registryEnv,
    )
    await expect(
      putMediaDeliveryRegistryRecord(
        { deliveryKey, state: 'withheld', generation: '2147483647' },
        registryEnv,
      ),
    ).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })
    await putMediaDeliveryRegistryRecord(
      { deliveryKey, state: 'withheld', generation: '2147483649' },
      registryEnv,
    )

    expect(await readMediaDeliveryRegistryItem(deliveryKey)).toEqual({
      state: 'withheld',
      generation: '2147483649',
    })
  })

  it('invalidates the delivery path on the configured distribution', async () => {
    // The shared distribution collects every other test's invalidations.
    const DistributionId = await createOwnedCloudFrontDistribution()
    const path = `/images/${randomUUID()}/*`
    await invalidateMediaDeliveryPath(path, {
      MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: DistributionId,
    })

    expect(await listInvalidatedPaths(DistributionId)).toEqual([path])
  })
})
