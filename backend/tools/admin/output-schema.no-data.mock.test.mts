/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Pure canonical JSON contract projection uses the data-store-free project. */
import { describe, expect, it } from 'vitest'
import { adminRouteOutputSchema } from './output-schema.mts'
import { findSchemaViolation } from '../schema-validator.mts'

describe('admin REST output schemas', () => {
  it('keeps crawler response alternatives inside the required MCP object root', () => {
    const schema = adminRouteOutputSchema({ method: 'GET', path: '/api/v1/crawlers' })
    expect(schema).toMatchObject({ type: 'object' })
    expect(findSchemaViolation(schema, { results: [] })).toBeNull()
    expect(findSchemaViolation(schema, [])).not.toBeNull()
  })
  it('keeps staff report projection explicit and bounded', () => {
    const schema = adminRouteOutputSchema({ method: 'GET', path: '/api/v1/reports' }, 'staff')
    expect(schema).toMatchObject({ type: 'object' })
    expect(findSchemaViolation(schema, {})).not.toBeNull()
  })
})
