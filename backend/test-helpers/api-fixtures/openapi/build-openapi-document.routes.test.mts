import { describe, expect, it } from 'vitest'

import type { BackendResponseContract } from '../response-contract-types.mts'
import { applyRequiredQueryParameterOverrides } from '../required-query-parameter-overrides.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'

describe('OpenAPI catalog response helpers', () => {
  it('marks only the explicitly reviewed required query fields', () => {
    const document = {
      paths: {
        '/api/v1/availability': {
          get: {
            parameters: [
              { in: 'query', name: 'kind', required: false },
              { in: 'query', name: 'value', required: false },
            ],
          },
        },
        '/api/v1/localization': {
          get: {
            parameters: [
              { in: 'query', name: 'consumer', required: false },
              { in: 'query', name: 'locales', required: false },
            ],
          },
        },
        '/api/v1/admin/warnings': {
          get: {
            parameters: [
              { in: 'query', name: 'userId', required: false },
              { in: 'query', name: 'after', required: false },
            ],
          },
        },
        '/api/v1/curated-aside-items': {
          get: { parameters: [{ in: 'query', name: 'type', required: false }] },
        },
        '/api/v1/hostnames/compare': {
          get: { parameters: [{ in: 'query', name: 'ids', required: false }] },
        },
        '/api/v1/lists/contains': {
          get: {
            parameters: [
              { in: 'query', name: 'entity_id', required: false },
              { in: 'query', name: 'item_type', required: false },
            ],
          },
        },
      },
    }

    applyRequiredQueryParameterOverrides(document)

    expect(document.paths['/api/v1/availability']!.get!.parameters).toEqual([
      { in: 'query', name: 'kind', required: true },
      { in: 'query', name: 'value', required: true },
    ])
    expect(document.paths['/api/v1/localization']!.get!.parameters).toEqual([
      { in: 'query', name: 'consumer', required: true },
      { in: 'query', name: 'locales', required: false },
    ])
    expect(document.paths['/api/v1/admin/warnings']!.get!.parameters).toEqual([
      { in: 'query', name: 'userId', required: true },
      { in: 'query', name: 'after', required: false },
    ])
    expect(document.paths['/api/v1/curated-aside-items']!.get!.parameters).toEqual([
      { in: 'query', name: 'type', required: true },
    ])
    expect(document.paths['/api/v1/hostnames/compare']!.get!.parameters).toEqual([
      { in: 'query', name: 'ids', required: true },
    ])
    expect(document.paths['/api/v1/lists/contains']!.get!.parameters).toEqual([
      { in: 'query', name: 'entity_id', required: true },
      { in: 'query', name: 'item_type', required: true },
    ])
  })

  it('adds SSE, error-only, and unknown operations without fake success', () => {
    const routes = [
      { method: 'GET', routeTemplate: '/api/v1/events', kind: 'sse', source: 'test:1' },
      { method: 'GET', routeTemplate: '/api/v1/mcp', kind: 'error-only', source: 'test:2' },
      { method: 'GET', routeTemplate: '/api/v1/unknown', kind: 'ordinary', source: 'test:3' },
      {
        method: 'GET',
        routeTemplate: '/api/v1/callback',
        kind: 'fixed-no-content',
        fixedStatus: 302,
        source: 'test:4',
      },
    ] as const
    const doc = buildOpenApiDocument({}, {}, {}, { registeredRoutes: routes })
    expect(doc.paths['/api/v1/events']!.get!.responses['200']).toHaveProperty(
      'content.text/event-stream',
    )
    expect(doc.paths['/api/v1/mcp']!.get!.responses).toEqual({
      405: { $ref: '#/components/responses/Error' },
      default: { $ref: '#/components/responses/Error' },
    })
    expect(doc.paths['/api/v1/mcp']!.get).not.toHaveProperty('x-schema-unavailable')
    expect(doc['x-unavailable-routes']).not.toContain('GET:/api/v1/mcp')
    expect(doc.paths['/api/v1/unknown']!.get!.responses['200']).toBeUndefined()
    expect(doc.paths['/api/v1/callback']!.get!.responses['302']).toEqual({
      description: 'Found',
    })
  })

  it('rejects fixed no-content metadata alongside extracted response variants', () => {
    const contract: BackendResponseContract = {
      method: 'GET',
      routeTemplate: '/api/v1/callback',
      source: 'test-contract',
      hash: 'hash',
      schema: {
        root: { type: 'object', properties: {}, additionalProperties: false },
        definitions: {},
      },
      bodyKind: 'content',
      mediaType: 'application/json',
    }
    const route = {
      method: 'GET',
      routeTemplate: '/api/v1/callback',
      kind: 'fixed-no-content' as const,
      fixedStatus: 302,
      source: 'test-route',
    }
    expect(() =>
      buildOpenApiDocument(
        { 'GET:/api/v1/callback': contract },
        {},
        {},
        { registeredRoutes: [route] },
      ),
    ).toThrow(
      'OpenAPI fixed-no-content metadata conflicts with extracted response variants for GET:/api/v1/callback',
    )
  })

  it('accepts matching extracted no-content metadata for a fixed no-content route', () => {
    const contract: BackendResponseContract = {
      method: 'DELETE',
      routeTemplate: '/api/v1/items/:id/vote',
      source: 'test-contract',
      hash: 'hash',
      schema: { root: { type: 'null' }, definitions: {} },
      bodyKind: 'none',
      statusCodes: [204],
      statusKnowledge: 'explicit',
    }
    const route = {
      method: 'DELETE',
      routeTemplate: '/api/v1/items/:id/vote',
      kind: 'fixed-no-content' as const,
      fixedStatus: 204,
      source: 'test-route',
    }
    expect(
      buildOpenApiDocument(
        { 'DELETE:/api/v1/items/:id/vote': contract },
        {},
        {},
        { registeredRoutes: [route] },
      ).paths['/api/v1/items/{id}/vote']!.delete!.responses['204'],
    ).toEqual({ description: 'No Content' })
  })

  it('rejects duplicate response groups with the same normalized method and path shape', () => {
    function response(routeTemplate: string): BackendResponseContract {
      return {
        method: 'GET',
        routeTemplate,
        source: routeTemplate,
        hash: routeTemplate,
        schema: { root: { type: 'unknown' }, definitions: {} },
        bodyKind: 'content',
        mediaType: 'application/json',
      }
    }
    expect(() =>
      buildOpenApiDocument(
        {
          'GET:/api/v1/stories/:id': response('/api/v1/stories/:id'),
          'GET:/api/v1/stories/:storyId': response('/api/v1/stories/:storyId'),
        },
        {},
      ),
    ).toThrow(
      'response contracts contain duplicate normalized route GET:/api/v1/stories/:: /api/v1/stories/:id and /api/v1/stories/:storyId',
    )
  })
})
