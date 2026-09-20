import { describe, expect, it } from 'vitest'
import {
  assertMediaDeliveryLegalEnforcementEnabled,
  getMediaDeliveryRegistryRegion,
  isMediaDeliveryEdgeEnforcementEnabled,
  isMediaDeliveryRegistryPublicationEnabled,
} from './media-delivery-registry.mts'

describe('media delivery registry AWS boundary', () => {
  it('requires the edge registry region instead of inheriting the application region', () => {
    expect(() => getMediaDeliveryRegistryRegion({ AWS_REGION: 'us-west-2' })).toThrow(
      'Missing MEDIA_DELIVERY_REGISTRY_REGION',
    )
    expect(
      getMediaDeliveryRegistryRegion({
        AWS_REGION: 'us-west-2',
        MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
      }),
    ).toBe('us-east-1')
  })

  it('only activates when the publisher, edge, and all edge authority configuration agree', () => {
    expect(isMediaDeliveryEdgeEnforcementEnabled({})).toBe(false)
    expect(
      isMediaDeliveryEdgeEnforcementEnabled({ MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED: 'true' }),
    ).toBe(true)
    expect(() =>
      isMediaDeliveryRegistryPublicationEnabled({
        MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
      }),
    ).toThrow('MEDIA_DELIVERY_REGISTRY_TABLE')
    expect(
      isMediaDeliveryRegistryPublicationEnabled({
        MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
        MEDIA_DELIVERY_REGISTRY_TABLE: 'media-registry',
        MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
        MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: 'distribution',
      }),
    ).toBe(true)
    expect(() =>
      assertMediaDeliveryLegalEnforcementEnabled({
        MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
        MEDIA_DELIVERY_REGISTRY_TABLE: 'media-registry',
        MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
        MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: 'distribution',
      }),
    ).toThrow('registry publication and edge enforcement')
    expect(() =>
      assertMediaDeliveryLegalEnforcementEnabled({
        MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED: 'true',
        MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
        MEDIA_DELIVERY_REGISTRY_TABLE: 'media-registry',
        MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
        MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: 'distribution',
      }),
    ).not.toThrow()
  })
})
