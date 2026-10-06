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
      adminResponses: {},
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
      responses: {},
    })
  })

  it('ships only named-component 200 responses, keyed like operations and outside them', () => {
    const named = { $ref: '#/components/schemas/ItemPage' }
    const ok = (schema: unknown) => ({
      responses: { '200': { content: { 'application/json': { schema } } } },
    })
    const bundle = buildRequestContractsBundle({
      paths: {
        '/api/v1/items/{id}': { get: ok(named) },
        '/api/v1/inline': { get: ok({ type: 'object', properties: {} }) },
        '/api/v1/described': { get: ok({ ...named, description: 'extra sibling keyword' }) },
        '/api/v1/no-content': { get: { responses: { '200': { description: 'OK' } } } },
        '/api/v1/other-status': {
          get: { responses: { '201': { content: { 'application/json': { schema: named } } } } },
        },
        '/api/v1/not-an-operation': { parameters: [] },
      },
      components: { schemas: { ItemPage: { type: 'object' } } },
    } as never)

    expect(bundle.responses).toEqual({ 'GET:/api/v1/items/:id': named })
    expect(bundle.operations).toEqual({})
  })
})
