/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This deterministic generated-registry test has no external dependency to mock; the .no-data.mock suffix is load-bearing because it routes the test to the DB/Valkey-free project. */
import { describe, expect, it } from 'vitest'
import { RuntimeRequestValidatorRegistry } from './index.mts'

describe('RuntimeRequestValidatorRegistry', () => {
  const registry = new RuntimeRequestValidatorRegistry({
    version: 1,
    source: 'compiler-extracted-request-contracts',
    components: {
      Name: { type: 'string', minLength: 1 },
    },
    operations: {
      'POST:/api/v1/items': {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { $ref: '#/components/schemas/Name' } },
          required: ['name'],
        },
      },
      'POST:/api/v1/permissive': { body: { type: 'object', additionalProperties: true } },
      'GET:/api/v1/items/:id': {
        path: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        query: { type: 'object', properties: { limit: { type: 'integer', minimum: 1 } } },
      },
    },
  })

  it('validates generated UUID path and query formats', () => {
    expect(registry.validate('GET:/api/v1/items/:id', 'path', { id: 'not-a-uuid' })).toMatchObject({
      message: expect.stringContaining('Invalid request path'),
    })
    expect(
      registry.validate('GET:/api/v1/items/:id', 'path', {
        id: '018f8780-6a0f-7c94-8d6c-b6b6d0b12a41',
      }),
    ).toBeNull()
    expect(registry.validate('GET:/api/v1/items/:id', 'query', { limit: 0 })).toMatchObject({
      message: expect.stringContaining('Invalid request query'),
    })
  })

  it('validates component-backed operation schemas', () => {
    expect(registry.validateBody('POST:/api/v1/items', { name: 'Voucha' })).toBeNull()
    expect(registry.validateBody('POST:/api/v1/items', { name: '' })).toEqual({
      message: 'Invalid request body',
    })
  })

  it('accepts permissive schemas', () => {
    expect(registry.validateBody('POST:/api/v1/permissive', { arbitrary: true })).toBeNull()
  })

  it('normalizes Node-style lowercase headers against generated header contracts', () => {
    expect(
      RuntimeRequestValidatorRegistry.shared.validate('POST:/api/v1/my/import/topics', 'header', {
        'idempotency-key': 'not-a-uuid',
      }),
    ).toMatchObject({ message: expect.stringContaining('Invalid request header') })
  })

  it('makes route-family adoption fail closed for unknown operation contracts', () => {
    expect(() =>
      RuntimeRequestValidatorRegistry.shared.validateAuthenticated(
        'POST:/api/v1/not-yet-migrated',
        {},
      ),
    ).toThrow('No generated runtime request contract')
  })

  it('rejects case-insensitive duplicate header names', () => {
    const headers = new RuntimeRequestValidatorRegistry({
      version: 1,
      source: 'compiler-extracted-request-contracts',
      components: {},
      operations: {
        'POST:/api/v1/items': {
          header: {
            type: 'object',
            properties: { 'idempotency-key': { type: 'string', format: 'uuid' } },
            required: ['idempotency-key'],
          },
        },
      },
    })
    expect(
      headers.validate('POST:/api/v1/items', 'header', {
        'Idempotency-Key': 'invalid',
        'idempotency-key': '018f8780-6a0f-7c94-8d6c-b6b6d0b12a41',
      }),
    ).toEqual({ message: 'Invalid request header' })
  })

  it('rejects asynchronous contracts when the registry is built', () => {
    expect(
      () =>
        new RuntimeRequestValidatorRegistry({
          version: 1,
          source: 'compiler-extracted-request-contracts',
          components: {},
          operations: { 'POST:/api/v1/items': { body: { $async: true, type: 'string' } } },
        }),
    ).toThrow('Asynchronous request contracts are not supported')
  })

  it('validates every supplied carrier at the authenticated route boundary', () => {
    expect(
      registry.validateAuthenticated('GET:/api/v1/items/:id', {
        path: { id: '018f8780-6a0f-7c94-8d6c-b6b6d0b12a41' },
        query: { limit: 2 },
      }),
    ).toBeNull()
    expect(
      registry.validateAuthenticated('GET:/api/v1/items/:id', {
        path: { id: 'not-a-uuid' },
        query: { limit: 2 },
      }),
    ).toMatchObject({ message: expect.stringContaining('Invalid request path') })
  })
})
