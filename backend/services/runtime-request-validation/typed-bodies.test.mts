import { describe, expect, it } from 'vitest'
import contracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }

type Schema = {
  $ref?: string
  type?: string | string[]
  properties?: Record<string, unknown>
  oneOf?: Schema[]
  anyOf?: Schema[]
  allOf?: Schema[]
}

function untypedBody(schema: Schema): boolean {
  if (schema.$ref) {
    const name = schema.$ref.replace('#/components/schemas/', '')
    if (name === 'Record_string_unknown') return true
    const components: Record<string, Schema> = contracts.components
    return untypedBody(components[name]!)
  }
  return (
    schema.type === 'object' &&
    !schema.properties &&
    !schema.oneOf &&
    !schema.anyOf &&
    !schema.allOf
  )
}

describe('checked-in request body contracts', () => {
  it('gives every object body named fields or a structured alternative', () => {
    const operations: Record<
      string,
      { body?: Schema; path?: unknown; query?: unknown; header?: unknown }
    > = contracts.operations
    const untyped = Object.entries(operations)
      .filter(([, operation]) => operation.body && untypedBody(operation.body))
      .map(([key]) => key)
    expect(untyped).toEqual([])
  })
})
