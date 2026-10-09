import { describe, expect, it } from 'vitest'
import { assertMcpLocalSchemaRefs } from '../test-helpers/mcp-local-schema-refs.mts'
import { findSchemaViolation } from './schema-validator.mts'
import { closeDeclaredInputObjects, factorToolSchema } from './tool-schema-contract.mts'

describe('tool schema contract', () => {
  it('closes declared objects in root alternatives while keeping arbitrary maps open', () => {
    const input = {
      type: 'object',
      oneOf: [
        { type: 'object', properties: { id: { type: 'string' } } },
        {
          type: 'object',
          properties: {
            config: { type: 'object', additionalProperties: true },
          },
        },
      ],
    }
    const closed = closeDeclaredInputObjects(input)
    expect(closed).toMatchObject({
      oneOf: [
        { additionalProperties: false },
        {
          additionalProperties: false,
          properties: { config: { additionalProperties: true } },
        },
      ],
    })
    expect(closed).not.toHaveProperty('additionalProperties')
  })

  it('factors repeated schema nodes only inside this tool and preserves local definitions', () => {
    const item = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        title: { type: 'string' },
      },
      required: ['id', 'title'],
      additionalProperties: false,
    }
    const schema = {
      type: 'object',
      properties: {
        first: { type: 'array', items: item },
        second: { type: 'array', items: item },
        third: item,
      },
      $defs: { Existing: { type: 'string' } },
    }
    const factored = factorToolSchema(schema)
    expect(JSON.stringify(factored).length).toBeLessThan(JSON.stringify(schema).length)
    expect(factored['$defs']).toMatchObject({ Existing: { type: 'string' } })
    const refs = JSON.stringify(factored).match(/#\/\$defs\/S\d+/g) ?? []
    expect(refs.length).toBeGreaterThanOrEqual(2)
    for (const ref of refs) expect(factored['$defs']).toHaveProperty(ref.slice('#/$defs/'.length))
    expect(schema).toHaveProperty('properties.third', item)
    assertMcpLocalSchemaRefs(factored)
    for (const value of [
      { first: [], second: [], third: { id: '00000000-0000-4000-8000-000000000001', title: 'A' } },
      {
        first: [{ id: '00000000-0000-4000-8000-000000000001', title: 'A' }],
        second: [],
        third: { id: '00000000-0000-4000-8000-000000000001' },
      },
      {
        first: [42],
        second: [],
        third: { id: '00000000-0000-4000-8000-000000000001', title: 'A' },
      },
    ])
      expect(findSchemaViolation(factored, value) === null).toBe(
        findSchemaViolation(schema, value) === null,
      )
  })

  it('preserves boolean property schemas and pre-existing local references', () => {
    const schema = {
      type: 'object',
      properties: { forbidden: false, allowed: { $ref: '#/$defs/Allowed' } },
      $defs: {
        Allowed: { type: 'object', properties: { type: { type: 'string' } } },
      },
    }
    const closed = closeDeclaredInputObjects(schema)
    expect(closed).toMatchObject({
      properties: { forbidden: false, allowed: { $ref: '#/$defs/Allowed' } },
      $defs: { Allowed: { additionalProperties: false } },
    })
    assertMcpLocalSchemaRefs(factorToolSchema(closed))
    expect(findSchemaViolation(closed, { allowed: { type: 'ok' } })).toBeNull()
    expect(findSchemaViolation(closed, { allowed: { type: 'ok', extra: true } })).not.toBeNull()
    expect(findSchemaViolation(closed, { forbidden: true })).not.toBeNull()
  })

  it('rejects external, component and dangling references in the test assertion', () => {
    for (const ref of ['https://example.org/x', '#/components/schemas/X', './x', '#/$defs/Missing'])
      expect(() =>
        assertMcpLocalSchemaRefs({
          type: 'object',
          properties: { x: { $ref: ref } },
        }),
      ).toThrow(/reference/i)
  })
})
