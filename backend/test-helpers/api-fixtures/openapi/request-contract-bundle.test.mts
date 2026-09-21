import { describe, expect, it } from 'vitest'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'

describe('buildRequestContractsBundle', () => {
  it('projects executable request schemas without making OpenAPI the runtime authority', () => {
    const bundle = buildRequestContractsBundle({
      paths: {
        '/api/v1/items/{id}': {
          post: {
            parameters: [
              {
                in: 'path',
                name: 'id',
                required: true,
                schema: { type: 'string', format: 'uuid' },
              },
              { in: 'query', name: 'limit', required: false, schema: { type: 'integer' } },
              { in: 'header', name: 'X-Client', required: true, schema: { type: 'string' } },
            ],
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
            },
          },
        },
      },
      components: { schemas: { Item: { type: 'object' } } },
    } as never)

    expect(bundle).toEqual({
      version: 1,
      source: 'compiler-extracted-request-contracts',
      components: { Item: { type: 'object' } },
      operations: {
        'POST:/api/v1/items/:id': {
          body: { $ref: '#/components/schemas/Item' },
          path: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' } },
            required: ['id'],
          },
          query: { type: 'object', properties: { limit: { type: 'integer' } } },
          header: {
            type: 'object',
            properties: { 'x-client': { type: 'string' } },
            required: ['x-client'],
          },
        },
      },
    })
  })
})
