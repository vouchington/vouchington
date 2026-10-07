import { describe, expect, it } from 'vitest'
import { findSchemaViolation } from './schema-validator.mts'

const SCHEMA = {
  type: 'object',
  properties: { page: { type: 'object', properties: { next: { type: 'boolean' } } } },
  required: ['page'],
  additionalProperties: false,
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
})
