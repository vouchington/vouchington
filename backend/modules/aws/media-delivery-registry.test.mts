import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertMediaDeliveryLegalEnforcementEnabled,
  getMediaDeliveryRegistryRegion,
  isMediaDeliveryEdgeEnforcementEnabled,
  isMediaDeliveryRegistryPublicationEnabled,
  putMediaDeliveryRegistryRecord,
} from './media-delivery-registry.mts'

describe('media delivery registry AWS boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
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

  it('allows a same-generation retry only when the edge state matches', async () => {
    const send = vi
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({ $metadata: {} } as never)
    await putMediaDeliveryRegistryRecord(
      {
        deliveryKey: 'image-placement:placement:1:image',
        state: 'allow',
        generation: '2147483648',
      },
      {
        MEDIA_DELIVERY_REGISTRY_TABLE: 'media-registry',
        MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
      },
    )
    const command = send.mock.calls[0]?.[0]
    if (!(command instanceof PutItemCommand)) throw new Error('expected a DynamoDB put command')

    expect(command.input).toMatchObject({
      ConditionExpression:
        'attribute_not_exists(delivery_key) OR #generation < :generation OR (#generation = :generation AND #state = :state)',
      ExpressionAttributeNames: { '#generation': 'generation', '#state': 'state' },
      ExpressionAttributeValues: {
        ':generation': { N: '2147483648' },
        ':state': { S: 'allow' },
      },
    })
  })
})
