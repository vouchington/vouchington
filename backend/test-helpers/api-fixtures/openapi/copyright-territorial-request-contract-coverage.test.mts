import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  CAPTCHA_BODIES,
  ENUMS,
  PATH_ONLY,
  PATH_PARAMETERS,
  REQUIRED_KEYS,
} from './copyright-territorial-request-contract-coverage.mts'

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

describe('copyright territorial request contracts', () => {
  it.each(Object.entries(REQUIRED_KEYS))('%s declares a closed body', (operation, required) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect([...(schema.required as string[])].sort()).toEqual(required)
    const properties = schema.properties as Record<string, Schema>
    const stringKeys = required.filter(key => key !== ENUMS[operation]?.field)
    expect(stringKeys.map(key => properties[key])).toEqual(
      stringKeys.map(() => ({ type: 'string' })),
    )
  })

  it.each(Object.entries(ENUMS))(
    '%s limits its enumerated field',
    (operation, { field, values }) => {
      const properties = resolve(carriersOf(operation).body).properties as Record<string, Schema>
      expect([...(properties[field]!.enum as string[])].sort()).toEqual(values)
    },
  )

  it.each(CAPTCHA_BODIES)('%s allows only an optional string CAPTCHA token', operation => {
    const schema = resolve(carriersOf(operation).body)
    const properties = schema.properties as Record<string, Schema>
    // String-only and optional: an explicit null is rejected, which is the one acceptance change.
    expect(properties.cf_turnstile_response).toEqual({ type: 'string' })
    expect(schema.required).not.toContain('cf_turnstile_response')
  })

  it.each(Object.keys(REQUIRED_KEYS).filter(operation => !CAPTCHA_BODIES.includes(operation)))(
    '%s declares no CAPTCHA token',
    operation => {
      const properties = resolve(carriersOf(operation).body).properties as Record<string, Schema>
      expect(properties.cf_turnstile_response).toBeUndefined()
    },
  )

  it.each(Object.entries(PATH_PARAMETERS))('%s declares its path ids', (operation, names) => {
    const path = carriersOf(operation).path as { properties: Schema; required: string[] }
    expect(path.required).toEqual(names)
    expect(Object.keys(path.properties)).toEqual(names)
  })

  it.each(PATH_ONLY)('%s declares a path carrier only', operation => {
    expect(Object.keys(carriersOf(operation))).toEqual(['path'])
  })
})
