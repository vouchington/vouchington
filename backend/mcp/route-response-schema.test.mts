import { describe, expect, it } from 'vitest'
import { assertMcpLocalSchemaRefs } from '../test-helpers/mcp-local-schema-refs.mts'
import { componentSchema, routeResponseSchema } from './route-response-schema.mts'

describe('checked-in route contracts', () => {
  it('resolves a shipped route into a schema that needs no document around it', () => {
    const schema = routeResponseSchema({
      method: 'GET',
      path: '/api/v1/my/cards',
    })

    expect(schema.type).toBe('object')
    expect(Object.keys(schema['properties'] as object).toSorted()).toEqual(['page_info', 'results'])
    assertMcpLocalSchemaRefs(schema)
  })

  it('fails loudly for a route that documents its response inline', () => {
    expect(() =>
      routeResponseSchema({
        method: 'GET',
        path: '/api/v1/my/financial-profile',
      }),
    ).toThrow('No checked-in response contract')
  })

  it('resolves a named component the same way', () => {
    const schema = componentSchema('UserFinancialProfile')

    expect(schema['type']).toBe('object')
    expect(schema['properties']).toHaveProperty('credit_score_range')
    assertMcpLocalSchemaRefs(schema)
  })
})
