import { describe, expect, it } from 'vitest'
import {
  componentSchema,
  inlineSchemaReferences,
  resolveRouteResponse,
  routePropertySchema,
  routeResponseSchema,
  successResultSchema,
} from './route-response-schema.mts'

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const ENDPOINT = { method: 'GET', path: '/api/v1/things' } as const

describe('inlineSchemaReferences', () => {
  it('inlines nested references and keeps the keywords written beside a reference', () => {
    const components = {
      Id: { type: 'string' },
      Thing: { type: 'object', properties: { id: ref('Id') } },
    }

    expect(
      inlineSchemaReferences(
        { anyOf: [{ ...ref('Thing'), description: 'A thing' }, { type: 'null' }] },
        components,
      ),
    ).toEqual({
      anyOf: [
        { type: 'object', properties: { id: { type: 'string' } }, description: 'A thing' },
        { type: 'null' },
      ],
    })
  })

  it('keeps a self-referencing component as a reference into root $defs', () => {
    const components = {
      Node: {
        type: 'object',
        properties: {
          parent: { anyOf: [ref('Node'), { type: 'null' }] },
          children: { type: 'array', items: ref('Node') },
        },
      },
    }

    const inlined = inlineSchemaReferences(ref('Node'), components)

    expect(inlined).toEqual({
      type: 'object',
      properties: {
        parent: { anyOf: [{ $ref: '#/$defs/Node' }, { type: 'null' }] },
        children: { type: 'array', items: { $ref: '#/$defs/Node' } },
      },
      $defs: {
        Node: {
          type: 'object',
          properties: {
            parent: { anyOf: [{ $ref: '#/$defs/Node' }, { type: 'null' }] },
            children: { type: 'array', items: { $ref: '#/$defs/Node' } },
          },
        },
      },
    })
  })

  it('terminates on mutually recursive components', () => {
    const components = {
      A: { type: 'object', properties: { b: ref('B') } },
      B: { type: 'object', properties: { a: ref('A') } },
    }

    const inlined = inlineSchemaReferences(ref('A'), components) as { $defs: object }

    expect(Object.keys(inlined.$defs)).toEqual(['A'])
    expect(JSON.stringify(inlined)).not.toContain('#/components')
  })

  it.each([ref('Missing'), { $ref: '#/definitions/Thing' }])(
    'rejects the unresolvable reference %j',
    schema => {
      expect(() => inlineSchemaReferences(schema, { Thing: { type: 'object' } })).toThrow(
        'Unresolvable response contract reference',
      )
    },
  )
})

describe('resolveRouteResponse', () => {
  const components = { Page: { type: 'object', properties: { total: { type: 'number' } } } }

  it('returns the self-contained object schema for a route', () => {
    expect(
      resolveRouteResponse(ENDPOINT, { 'GET:/api/v1/things': ref('Page') }, components),
    ).toEqual({ type: 'object', properties: { total: { type: 'number' } } })
  })

  it('names the route when it has no generated response contract', () => {
    expect(() => resolveRouteResponse(ENDPOINT, {}, components)).toThrow(
      'No generated response contract for GET:/api/v1/things',
    )
  })

  it('rejects a route whose response is not an object, which MCP requires', () => {
    expect(() =>
      resolveRouteResponse(
        ENDPOINT,
        { 'GET:/api/v1/things': { type: 'array', items: { type: 'string' } } },
        components,
      ),
    ).toThrow('is not an object')
  })
})

describe('generated route contracts', () => {
  it('resolves a shipped route into a schema that needs no document around it', () => {
    const schema = routeResponseSchema({ method: 'GET', path: '/api/v1/my/cards' })

    expect(schema.type).toBe('object')
    expect(Object.keys(schema['properties'] as object).sort()).toEqual(['page_info', 'results'])
    expect(JSON.stringify(schema)).not.toContain('$ref')
  })

  it('fails loudly for a route that documents its response inline', () => {
    expect(() =>
      routeResponseSchema({ method: 'GET', path: '/api/v1/my/financial-profile' }),
    ).toThrow('No generated response contract')
  })

  it('resolves a named component the same way', () => {
    const schema = componentSchema('UserFinancialProfile')

    expect(schema['type']).toBe('object')
    expect(schema['properties']).toHaveProperty('credit_score_range')
    expect(JSON.stringify(schema)).not.toContain('$ref')
  })
})

describe('routePropertySchema', () => {
  const body = {
    type: 'object',
    properties: { results: { type: 'array' } },
  } as const

  it('returns one property of the body', () => {
    expect(routePropertySchema(body, 'results')).toEqual({ type: 'array' })
  })

  it('rejects a property the contract does not have', () => {
    expect(() => routePropertySchema(body, 'page_info')).toThrow('no "page_info" property')
  })

  it('rejects a recursive body, whose $defs cannot move with one property', () => {
    expect(() => routePropertySchema({ ...body, $defs: {} }, 'results')).toThrow('recursive')
  })
})

describe('successResultSchema', () => {
  it('wraps the body in the success envelope the list tools return', () => {
    expect(successResultSchema({ type: 'object', properties: {} })).toEqual({
      type: 'object',
      properties: { success: { const: true }, result: { type: 'object', properties: {} } },
      required: ['success', 'result'],
      additionalProperties: false,
    })
  })

  it('hoists $defs to the root of the envelope so their references still resolve', () => {
    expect(
      successResultSchema({ type: 'object', properties: {}, $defs: { Node: { type: 'object' } } }),
    ).toMatchObject({
      properties: { result: { type: 'object', properties: {} } },
      $defs: { Node: { type: 'object' } },
    })
  })
})
