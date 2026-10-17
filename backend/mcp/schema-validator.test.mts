import { describe, expect, it } from 'vitest'
import { findSchemaViolation } from './schema-validator.mts'
import { mcpDateTimeFixtures } from '../test-helpers/mcp-date-time-cases.mts'

const SCHEMA = {
  type: 'object',
  properties: { page: { type: 'object', properties: { next: { type: 'boolean' } } } },
  required: ['page'],
  additionalProperties: false,
}

const MERGED_SCHEMA = {
  type: 'object',
  oneOf: [
    {
      type: 'object',
      properties: {
        option: { type: 'string', enum: ['get'] },
        arguments: { $ref: '#/$defs/GetArgs' },
      },
      required: ['option', 'arguments'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        option: { type: 'string', enum: ['list'] },
        arguments: { type: 'object', additionalProperties: false },
      },
      required: ['option', 'arguments'],
      additionalProperties: false,
    },
  ],
  $defs: {
    GetArgs: {
      type: 'object',
      properties: { page: { $ref: '#/$defs/Page' } },
      required: ['page'],
      additionalProperties: false,
    },
    Page: {
      type: 'object',
      properties: { after: { type: 'string' } },
      required: ['after'],
      additionalProperties: false,
    },
  },
}

describe('findSchemaViolation', () => {
  it('returns null for a conforming value', () => {
    expect(findSchemaViolation(SCHEMA, { page: { next: true } })).toBeNull()
  })

  it('names where and which rule failed', () => {
    expect(findSchemaViolation(SCHEMA, { page: { next: 'yes' } })).toBe(
      '/page/next must be boolean',
    )
  })

  it('uses the root path for a violation of the whole value', () => {
    expect(findSchemaViolation(SCHEMA, 'not an object')).toBe('/ must be object')
  })

  it('never includes the offending value', () => {
    const violation = findSchemaViolation(SCHEMA, { page: { next: 'secret-value-123' } })

    expect(violation).not.toContain('secret-value-123')
  })

  it('keeps validating after the schema is cached', () => {
    expect(findSchemaViolation(SCHEMA, { page: {} })).toBeNull()
    expect(findSchemaViolation(SCHEMA, {})).not.toBeNull()
  })

  it('reports the selected option argument error through local references', () => {
    expect(
      findSchemaViolation(MERGED_SCHEMA, {
        option: 'get',
        arguments: { page: { after: 42 } },
      }),
    ).toBe('/page/after must be string')
  })

  it('still rejects an unknown option and an extra envelope field', () => {
    expect(findSchemaViolation(MERGED_SCHEMA, { option: 'other', arguments: {} })).not.toBeNull()
    expect(
      findSchemaViolation(MERGED_SCHEMA, {
        option: 'get',
        arguments: { page: { after: 'cursor' } },
        extra: true,
      }),
    ).not.toBeNull()
  })

  it('keeps generic oneOf diagnostics when there is no merged option selector', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          properties: { action: { enum: ['open'] }, arguments: { type: 'object' } },
          required: ['action', 'arguments'],
        },
        {
          type: 'object',
          properties: { action: { enum: ['close'] }, arguments: { type: 'object' } },
          required: ['action', 'arguments'],
        },
      ],
    }

    expect(findSchemaViolation(schema, { action: 'other', arguments: {} })).not.toBeNull()
  })
})

describe('shared MCP date-time contract', () => {
  it.each(mcpDateTimeFixtures.cases)('$id', ({ value, valid }) => {
    expect(findSchemaViolation(mcpDateTimeFixtures.schema, value) === null).toBe(valid)
  })

  it('enforces the format through nested references and cached schemas', () => {
    const schema = {
      type: 'object',
      properties: { timestamp: { $ref: '#/$defs/Timestamp' } },
      $defs: { Timestamp: mcpDateTimeFixtures.schema },
    }
    expect(findSchemaViolation(schema, { timestamp: '1990-12-31T23:59:60Z' })).toBeNull()
    expect(findSchemaViolation(schema, { timestamp: '2026-10-09T23:59:60Z' })).toBe(
      '/timestamp must match format "date-time"',
    )
  })
})
