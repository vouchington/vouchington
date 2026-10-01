import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  FILING,
  FILING_KINDS,
  LIST,
  PATH_PARAMETERS,
  REQUIRED_KEYS,
  REVOKE,
} from './copyright-guest-request-contract-coverage.mts'

type Schema = Record<string, unknown>
type Carriers = { body?: Schema; header?: Schema; path?: Schema; query?: Schema }
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

function properties(operation: string): Record<string, Schema> {
  return resolve(carriersOf(operation).body).properties as Record<string, Schema>
}

describe('copyright guest request contracts', () => {
  it.each(Object.entries(REQUIRED_KEYS))('%s declares a closed body', (operation, required) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect([...(schema.required as string[])].sort()).toEqual(required)
  })

  it('keeps the guest filing CAPTCHA token an optional string', () => {
    expect(properties(FILING).cf_turnstile_response).toEqual({ type: 'string' })
    expect(resolve(carriersOf(FILING).body).required).not.toContain('cf_turnstile_response')
  })

  it('limits the guest filing kind to the three accepted kinds', () => {
    expect([...(properties(FILING).kind!.enum as string[])].sort()).toEqual(FILING_KINDS)
  })

  it.each(Object.entries(PATH_PARAMETERS))('%s declares its path ids', (operation, names) => {
    const path = carriersOf(operation).path as { properties: Schema; required: string[] }
    expect([...path.required].sort()).toEqual(names)
    expect(Object.keys(path.properties).sort()).toEqual(names)
  })

  it('declares revocation without a body or query carrier', () => {
    expect(Object.keys(carriersOf(REVOKE))).toEqual(['path'])
  })

  it('declares the guest capability header on the guest filing without a body key for it', () => {
    expect(Object.keys(carriersOf(FILING).header!.properties as Schema)).toEqual([
      'copyright-guest-capability',
    ])
    expect(properties(FILING)).not.toHaveProperty('copyright-guest-capability')
  })

  it('declares the list query with the parser limit bounds', () => {
    const query = carriersOf(LIST).query as { properties: Schema }
    expect(query.properties).toEqual({
      after: { type: 'string' },
      limit: { default: 25, maximum: 100, minimum: 1, type: 'integer' },
    })
  })
})
