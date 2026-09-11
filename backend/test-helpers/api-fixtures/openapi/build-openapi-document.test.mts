import { describe, expect, it } from 'vitest'
import {
  objectNode as obj,
  requiredProperty as prop,
  type OpenApiResponse,
} from 'vouchington-tooling/openapi-document'

import type { ContractSchema } from '../contract-schema-types.mts'
import type { BackendResponseContract } from '../response-contract-types.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'

function contract(
  method: string,
  routeTemplate: string,
  overrides: Partial<BackendResponseContract> = {},
): BackendResponseContract {
  return {
    method,
    routeTemplate,
    source: `${method}:${routeTemplate}`,
    schema: { root: { type: 'unknown' }, definitions: {} },
    hash: 'hash',
    ...overrides,
  }
}

function buildDoc(contracts: Record<string, BackendResponseContract>) {
  return buildOpenApiDocument(contracts, {}) // single-arg wrapper for oxfmt's object-hugging format
}

function jsonSchemaOf(document: ReturnType<typeof buildDoc>, path: string, method: string) {
  const response = document.paths[path]![method]!.responses['200'] as OpenApiResponse
  return response.content!['application/json'].schema
}

describe('buildOpenApiDocument', () => {
  it('documents a single-variant route at its default 200 status', () => {
    const doc = buildDoc({
      'GET:/api/v1/posts/:id': contract('GET', '/api/v1/posts/:id', {
        schema: { root: obj({ id: prop({ type: 'string' }) }), definitions: {} },
      }),
    })
    expect(doc.paths['/api/v1/posts/{id}']!.get).toEqual({
      operationId: 'get_api_v1_posts_id',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
        },
        default: { $ref: '#/components/responses/Error' },
      },
    })
  })

  it('uses the captured setStatus literal over the null-root default', () => {
    const doc = buildDoc({
      'POST:/api/v1/things': contract('POST', '/api/v1/things', {
        statusCodes: [201],
        schema: { root: obj({ id: prop({ type: 'string' }) }), definitions: {} },
      }),
    })
    expect(doc.paths['/api/v1/things']!.post!.responses['201']).toMatchObject({
      description: 'Created',
    })
  })

  it('defaults to 204 No Content when every succeeding variant has a null root and no status was captured', () => {
    const doc = buildDoc({
      'DELETE:/api/v1/things/:id': contract('DELETE', '/api/v1/things/:id', {
        schema: { root: { type: 'null' }, definitions: {} },
      }),
    })
    expect(doc.paths['/api/v1/things/{id}']!.delete!.responses['204']).toEqual({
      description: 'No Content',
    })
  })

  it('documents every branch of a ternary-captured status as its own response entry', () => {
    const doc = buildDoc({
      'POST:/api/v1/things': contract('POST', '/api/v1/things', {
        statusCodes: [200, 201],
        schema: { root: obj({ id: prop({ type: 'string' }) }), definitions: {} },
      }),
    })
    const responses = doc.paths['/api/v1/things']!.post!.responses
    expect(responses['200']).toMatchObject({ description: 'OK' })
    expect(responses['201']).toMatchObject({ description: 'Created' })
  })

  it('merges same-status privilege-gated variants into anyOf', () => {
    const doc = buildDoc({
      'GET:/api/v1/users/:id': contract('GET', '/api/v1/users/:id', {
        schema: { root: obj({ name: prop({ type: 'string' }) }), definitions: {} },
      }),
      'GET:/api/v1/users/:id#staff': contract('GET', '/api/v1/users/:id', {
        source: 'staff-source',
        schema: {
          root: obj({ name: prop({ type: 'string' }), email: prop({ type: 'string' }) }),
          definitions: {},
        },
      }),
    })
    expect(jsonSchemaOf(doc, '/api/v1/users/{id}', 'get').anyOf).toHaveLength(2)
  })

  it('collapses identical variant renders to a bare schema instead of a redundant anyOf', () => {
    const schema: ContractSchema = {
      root: obj({ name: prop({ type: 'string' }) }),
      definitions: {},
    }
    const doc = buildDoc({
      'GET:/api/v1/x': contract('GET', '/api/v1/x', { schema }),
      'GET:/api/v1/x#variant': contract('GET', '/api/v1/x', { source: 'v2', schema }),
    })
    const responseSchema = jsonSchemaOf(doc, '/api/v1/x', 'get')
    expect(responseSchema.anyOf).toBeUndefined()
    expect(responseSchema.type).toBe('object')
  })

  it('marks a route unavailable from lenient extraction and surfaces it in x-unavailable-routes', () => {
    const doc = buildDoc({
      'GET:/api/v1/broken': contract('GET', '/api/v1/broken', {
        unavailableReason: 'Unsupported response contract type "any"',
      }),
    })
    expect(doc.paths['/api/v1/broken']!.get).toMatchObject({
      'x-schema-unavailable': true,
      'x-schema-unavailable-reason': 'Unsupported response contract type "any"',
    })
    expect(doc['x-unavailable-routes']).toEqual(['GET:/api/v1/broken'])
  })

  it('marks a route unavailable when conversion itself throws on an intersection merge conflict', () => {
    const doc = buildDoc({
      'GET:/api/v1/conflicted': contract('GET', '/api/v1/conflicted', {
        schema: {
          root: {
            type: 'intersection',
            variants: [
              obj({ post_type: prop({ type: 'literal', value: 'text' }) }),
              obj({ post_type: prop({ type: 'literal', value: 'link' }) }),
            ],
          },
          definitions: {},
        },
      }),
    })
    expect(doc.paths['/api/v1/conflicted']!.get).toMatchObject({
      'x-schema-unavailable': true,
    })
    expect(doc['x-unavailable-routes']).toEqual(['GET:/api/v1/conflicted'])
  })

  it('marks the whole group unavailable when only one of several variants fails', () => {
    const doc = buildDoc({
      'GET:/api/v1/mixed': contract('GET', '/api/v1/mixed', {
        schema: { root: obj({ name: prop({ type: 'string' }) }), definitions: {} },
      }),
      'GET:/api/v1/mixed#staff': contract('GET', '/api/v1/mixed', {
        source: 'staff-source',
        unavailableReason: 'Unsupported response contract type "any"',
      }),
    })
    expect(doc.paths['/api/v1/mixed']!.get).toMatchObject({
      'x-schema-unavailable': true,
    })
    expect(doc['x-unavailable-routes']).toEqual(['GET:/api/v1/mixed'])
  })

  it('throws when two different routes register the same component name with conflicting shapes', () => {
    // Components now commit only after a whole operation's variants convert cleanly (see the
    // "does not orphan" test below), so a genuine cross-route collision surfaces as a hard,
    // uncaught failure of the whole generation rather than a per-route degradation — matching
    // the schema registry's fail-loud collision policy.
    expect(() =>
      buildDoc({
        'GET:/api/v1/a': contract('GET', '/api/v1/a', {
          schema: {
            root: { type: 'ref', name: 'Widget' },
            definitions: { Widget: obj({ id: prop({ type: 'string' }) }) },
          },
        }),
        'GET:/api/v1/b': contract('GET', '/api/v1/b', {
          source: 'b-source',
          schema: {
            root: { type: 'ref', name: 'Widget' },
            definitions: { Widget: obj({ id: prop({ type: 'number' }) }) },
          },
        }),
      }),
    ).toThrow('maps to conflicting shapes')
  })

  it("retains an earlier variant's referenced component when a later variant fails", () => {
    const doc = buildDoc({
      'GET:/api/v1/mixed': contract('GET', '/api/v1/mixed', {
        schema: {
          root: { type: 'ref', name: 'Widget' },
          definitions: { Widget: obj({ id: prop({ type: 'string' }) }) },
        },
      }),
      'GET:/api/v1/mixed#staff': contract('GET', '/api/v1/mixed', {
        source: 'staff-source',
        schema: {
          root: {
            type: 'intersection',
            variants: [
              obj({ post_type: prop({ type: 'literal', value: 'text' }) }),
              obj({ post_type: prop({ type: 'literal', value: 'link' }) }),
            ],
          },
          definitions: {},
        },
      }),
    })
    expect(doc['x-unavailable-routes']).toEqual(['GET:/api/v1/mixed'])
    expect(doc.components.schemas.Widget).toBeDefined()
  })

  it('extracts path parameters in appearance order and builds a deterministic operationId', () => {
    const doc = buildDoc({
      'GET:/api/v1/urls/:id/crawls/:crawlId': contract('GET', '/api/v1/urls/:id/crawls/:crawlId', {
        schema: { root: obj({}), definitions: {} },
      }),
    })
    const operation = doc.paths['/api/v1/urls/{id}/crawls/{crawlId}']!.get!
    expect(operation.operationId).toBe('get_api_v1_urls_id_crawls_crawlId')
    expect(operation.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'crawlId', in: 'path', required: true, schema: { type: 'string' } },
    ])
  })

  it('groups multiple methods on the same route template under one path item', () => {
    const doc = buildDoc({
      'GET:/api/v1/things/:id': contract('GET', '/api/v1/things/:id', {
        schema: { root: obj({}), definitions: {} },
      }),
      'DELETE:/api/v1/things/:id': contract('DELETE', '/api/v1/things/:id', {
        schema: { root: { type: 'null' }, definitions: {} },
      }),
    })
    expect(Object.keys(doc.paths['/api/v1/things/{id}']!).toSorted()).toEqual(['delete', 'get'])
  })

  it('merges two methods that differ only by path-parameter name into one path item', () => {
    const doc = buildDoc({
      'GET:/api/v1/stories/:id': contract('GET', '/api/v1/stories/:id', {
        schema: { root: obj({}), definitions: {} },
      }),
      'PATCH:/api/v1/stories/:storyId': contract('PATCH', '/api/v1/stories/:storyId', {
        schema: { root: { type: 'null' }, definitions: {} },
      }),
    })
    const storyPaths = Object.keys(doc.paths).filter(path => path.includes('stories'))
    expect(storyPaths).toEqual(['/api/v1/stories/{id}'])
    const pathItem = doc.paths['/api/v1/stories/{id}']!
    expect(Object.keys(pathItem).toSorted()).toEqual(['get', 'patch'])
    expect(pathItem.get!.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ])
    expect(pathItem.patch!.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ])
  })

  it('wires ErrorBody and a static Voucha document root', () => {
    const doc = buildDoc({})
    expect(doc.components.responses.Error).toEqual({
      description: 'Error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } },
    })
    expect(doc.components.schemas.ErrorBody).toEqual({
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        request_id: { type: 'string' },
        stack: { type: 'string' },
      },
      required: ['message'],
      additionalProperties: false,
    })
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info).toEqual({ title: 'Voucha API', version: '1.0.0' })
    expect(doc['x-unavailable-routes']).toEqual([])
  })
})
