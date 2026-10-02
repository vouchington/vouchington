import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  ACCOUNTS,
  ENUMS,
  PATH_PARAMETERS,
  QUEUE,
  REQUIRED_KEYS,
} from './copyright-staff-request-contract-coverage.mts'

type Schema = Record<string, unknown>
type Carriers = { body?: Schema; path?: Schema; query?: Schema }
type Bundle = { components: Record<string, Schema>; operations: Record<string, Carriers> }

const bundle = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../api-fixtures/v1/request-contracts.json', import.meta.url)),
    'utf8',
  ),
) as Bundle

function resolve(schema: Schema | undefined): Schema {
  if (!schema) throw new Error('missing schema')
  const name = typeof schema.$ref === 'string' ? schema.$ref.split('/').at(-1) : undefined
  return name ? bundle.components[name]! : schema
}

function carriersOf(operation: string): Carriers {
  const carriers = bundle.operations[operation]
  if (!carriers) throw new Error(`${operation} has no request contract`)
  return carriers
}

describe('copyright staff request contracts', () => {
  it.each(Object.entries(REQUIRED_KEYS))('%s declares a closed body', (operation, required) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect((schema.required as string[]).toSorted()).toEqual(required)
    const properties = schema.properties as Record<string, Schema>
    expect(properties.rationale).toEqual({ type: 'string' })
  })

  it.each(Object.entries(ENUMS))(
    '%s limits its enumerated field',
    (operation, { field, values }) => {
      const properties = resolve(carriersOf(operation).body).properties as Record<string, Schema>
      expect((properties[field]!.enum as string[]).toSorted()).toEqual(values)
    },
  )

  it.each(Object.entries(PATH_PARAMETERS))('%s declares its path id', (operation, names) => {
    const path = carriersOf(operation).path as { properties: Schema; required: string[] }
    expect(path.required).toEqual(names)
    expect(Object.keys(path.properties)).toEqual(names)
  })

  it('declares the account list with a path carrier only', () => {
    expect(Object.keys(carriersOf(ACCOUNTS))).toEqual(['path'])
  })

  it('declares the staff queue query with the parser limit bounds', () => {
    const query = carriersOf(QUEUE).query as { properties: Schema }
    expect(query.properties).toEqual({
      after: { type: 'string' },
      limit: { default: 100, maximum: 100, minimum: 1, type: 'integer' },
    })
  })
})
