import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  CLOSED_BODIES,
  QUERY_CARRIERS,
  SKIPPED_OPERATIONS,
} from './content-routes-request-contract-coverage.mts'

type Schema = Record<string, unknown>
type Carriers = { body?: Schema; header?: Schema; path?: Schema; query?: Schema }
type Bundle = { components: Record<string, Schema>; operations: Record<string, Carriers> }

const bundle = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../api-fixtures/v1/request-contracts.json', import.meta.url)),
    'utf8',
  ),
) as Bundle

const limitOperations = Object.keys(QUERY_CARRIERS).filter(operation =>
  QUERY_CARRIERS[operation]!.includes('limit'),
)

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

describe('content route request contracts', () => {
  it.each(Object.entries(CLOSED_BODIES))(
    '%s declares a closed body with the required keys',
    (operation, required) => {
      const schema = resolve(carriersOf(operation).body)
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
      expect([...((schema.required as string[] | undefined) ?? [])].toSorted()).toEqual([
        ...required,
      ])
    },
  )

  it.each(Object.entries(QUERY_CARRIERS))('%s declares its query keys', (operation, keys) => {
    const properties = resolve(carriersOf(operation).query).properties as Record<string, Schema>
    expect(Object.keys(properties)).toEqual(expect.arrayContaining([...keys]))
  })

  it.each(limitOperations)('%s declares limit as an integer', operation => {
    const properties = resolve(carriersOf(operation).query).properties as Record<string, Schema>
    expect(properties.limit!.type).toBe('integer')
  })

  it('declares the story discussion idempotency key as a UUID header', () => {
    const header = carriersOf('POST:/api/v1/stories/:storyId/discussions').header
    const properties = header?.properties as Record<string, Schema>
    expect(properties['idempotency-key']).toMatchObject({ format: 'uuid', type: 'string' })
  })

  it.each(Object.entries(SKIPPED_OPERATIONS))('keeps %s free of validatable carriers (%s)', op => {
    const carriers = carriersOf(op)
    expect(Object.keys(carriers)).toEqual(['path'])
    const properties = (carriers.path as { properties: Record<string, Schema> }).properties
    for (const property of Object.values(properties)) expect(property).toEqual({ type: 'string' })
  })
})
