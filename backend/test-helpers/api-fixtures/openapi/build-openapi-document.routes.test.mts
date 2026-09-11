import { describe, expect, it } from 'vitest'

import type { BackendResponseContract } from '../response-contract-types.mts'
import { COLD_OPENAPI_BUILD_TIMEOUT_MS } from '../cold-build-budget.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'
import type { OpenApiSchema } from 'vouchington-tooling/openapi-document'

const passkeyOptionRoutes = [
  '/api/v1/auth/mfa/passkeys/authentication/options',
  '/api/v1/auth/passkeys/authentication/options',
  '/api/v1/auth/passkeys/registration/options',
] as const

describe('OpenAPI catalog response helpers', () => {
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
    expect(doc.paths['/api/v1/mcp']!.get!.responses['405']).toEqual({
      $ref: '#/components/responses/Error',
    })
    expect(doc.paths['/api/v1/mcp']!.get).toMatchObject({
      'x-schema-unavailable': true,
      'x-schema-unavailable-reason': 'registered route has no success response',
    })
    expect(doc['x-unavailable-routes']).toContain('GET:/api/v1/mcp')
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

  it(
    'keeps passkey option routes available without the non-JSON-safe prf extension',
    () => {
      const doc = buildOpenApiDocument()

      for (const path of passkeyOptionRoutes) {
        const operation = doc.paths[path]!.post!
        expect(operation).not.toHaveProperty('x-schema-unavailable')

        const response = operation.responses['200']!
        if (!('content' in response)) throw new Error(`${path} has no OpenAPI response content`)
        const schema = response.content!['application/json']!.schema as OpenApiSchema
        const options = resolveSchema(doc.components.schemas, schema).properties!.options!
        const extensions = resolveSchema(doc.components.schemas, options).properties!.extensions

        expect(extensions).toBeDefined()
        expect(resolveSchema(doc.components.schemas, extensions!)).not.toHaveProperty(
          'properties.prf',
        )
      }
    },
    COLD_OPENAPI_BUILD_TIMEOUT_MS,
  )
})

function resolveSchema(
  schemas: Record<string, OpenApiSchema>,
  schema: OpenApiSchema,
): OpenApiSchema {
  if (!schema.$ref) return schema
  const name = schema.$ref.split('/').at(-1)
  if (!name || !schemas[name]) throw new Error(`Missing OpenAPI component ${schema.$ref}`)
  return schemas[name]
}
