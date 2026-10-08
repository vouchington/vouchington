import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlacementSourcePolicy } from '@ts-shared/url-signing'
import { authorizeOgDependencies } from '../authorize.mts'

const dependency: PlacementSourcePolicy = {
  placementId: '11111111-1111-4111-8111-111111111111',
  revision: 2,
  imageId: '22222222-2222-4222-8222-222222222222',
}

const env = {
  MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: 'enforce',
  MEDIA_DELIVERY_REGISTRY_TABLE: 'placement-registry',
  MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
}

describe('OG registry authorization', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses the exact shared key, consistent reads, projected state and configured region', async () => {
    const send = vi
      .spyOn(DynamoDBClient.prototype, 'send')
      .mockResolvedValue({ Item: { state: { S: 'allow' } }, $metadata: {} } as never)
    await expect(authorizeOgDependencies([dependency], env)).resolves.toEqual({
      states: ['allow'],
      cacheable: true,
    })
    const command = send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(GetItemCommand)
    if (!(command instanceof GetItemCommand)) throw new Error('expected GetItem')
    expect(command.input).toEqual({
      TableName: 'placement-registry',
      Key: {
        delivery_key: {
          S: 'image-placement:11111111-1111-4111-8111-111111111111:2:22222222-2222-4222-8222-222222222222',
        },
      },
      ConsistentRead: true,
      ProjectionExpression: '#state',
      ExpressionAttributeNames: { '#state': 'state' },
    })
    const client = send.mock.contexts[0] as DynamoDBClient
    await expect(client.config.region()).resolves.toBe('us-east-1')
  })

  it('maps allowed, withheld, missing and unexpected records', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send')
    for (const [item, expected] of [
      [{ state: { S: 'allow' } }, 'allow'],
      [{ state: { S: 'withheld' } }, 'withheld'],
      [undefined, 'unknown'],
      [{ state: { S: 'pending' } }, 'unknown'],
    ] as const) {
      send.mockResolvedValueOnce({ Item: item, $metadata: {} } as never)
      await expect(authorizeOgDependencies([dependency], env)).resolves.toEqual({
        states: [expected],
        cacheable: true,
      })
    }
    expect(send).toHaveBeenCalledTimes(4)
  })

  it('drops every dependency and disables caching when any read fails', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send')
    send.mockResolvedValueOnce({ Item: { state: { S: 'allow' } }, $metadata: {} } as never)
    send.mockRejectedValueOnce(new Error('registry unavailable'))
    await expect(authorizeOgDependencies([dependency, dependency], env)).resolves.toEqual({
      states: ['unknown', 'unknown'],
      cacheable: false,
    })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('keeps empty and inactive cards cacheable without reading the registry', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send')
    await expect(authorizeOgDependencies([], {})).resolves.toEqual({ states: [], cacheable: true })
    for (const mode of ['off', 'report']) {
      await expect(
        authorizeOgDependencies([dependency], { MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: mode }),
      ).resolves.toEqual({ states: ['unknown'], cacheable: true })
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('disables caching for missing configuration and never reads over four tuples', async () => {
    const send = vi.spyOn(DynamoDBClient.prototype, 'send')
    await expect(
      authorizeOgDependencies([dependency], { MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE: 'enforce' }),
    ).resolves.toEqual({ states: ['unknown'], cacheable: false })
    await expect(
      authorizeOgDependencies(
        Array.from({ length: 5 }, () => ({ ...dependency })),
        env,
      ),
    ).resolves.toEqual({
      states: Array(5).fill('unknown'),
      cacheable: false,
    })
    expect(send).not.toHaveBeenCalled()
    send.mockResolvedValue({ Item: { state: { S: 'allow' } }, $metadata: {} } as never)
    await expect(
      authorizeOgDependencies(
        Array.from({ length: 4 }, () => ({ ...dependency })),
        env,
      ),
    ).resolves.toEqual({
      states: Array(4).fill('allow'),
      cacheable: true,
    })
    expect(send).toHaveBeenCalledTimes(4)
  })
})
