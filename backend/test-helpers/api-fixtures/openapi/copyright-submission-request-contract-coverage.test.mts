import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  APPEALS,
  ATTESTATIONS,
  COUNTER_NOTICES,
  NOTICES,
  PATH_ONLY,
  REQUIRED_KEYS,
} from './copyright-submission-request-contract-coverage.mts'

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

function properties(operation: string): Record<string, Schema> {
  return resolve(carriersOf(operation).body).properties as Record<string, Schema>
}

describe('copyright submission request contracts', () => {
  it.each(Object.entries(REQUIRED_KEYS))('%s declares a closed body', (operation, required) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect((schema.required as string[]).toSorted()).toEqual(required)
  })

  it.each(Object.keys(REQUIRED_KEYS))('%s keeps the CAPTCHA token optional', operation => {
    expect(properties(operation).cf_turnstile_response).toEqual({ type: 'string' })
    expect(resolve(carriersOf(operation).body).required).not.toContain('cf_turnstile_response')
  })

  it.each(Object.entries(ATTESTATIONS))('%s requires every attestation to be true', (op, keys) => {
    for (const key of keys) expect(properties(op)[key]).toEqual({ const: true })
  })

  it('pins the notice jurisdiction to us_dmca', () => {
    expect(properties(NOTICES).jurisdiction).toEqual({ const: 'us_dmca' })
  })

  it('bounds notice targets to 1-20 closed hosted surface branches', () => {
    const targets = properties(NOTICES).targets as Schema
    expect(targets).toMatchObject({ type: 'array', minItems: 1, maxItems: 20 })
    const item = resolve(targets.items as Schema)
    const owners: Record<string, string> = {
      'community-banner-image': 'community_id',
      'community-profile-image': 'community_id',
      'post-image': 'post_id',
      'topic-hero-image': 'topic_id',
      'topic-logo-image': 'topic_id',
      'user-profile-image': 'user_id',
      'user-profile-link-image': 'user_profile_link_id',
    }
    const branches = item.anyOf as Schema[]
    expect(branches).toHaveLength(Object.keys(owners).length)
    for (const branch of branches) {
      const fields = branch.properties as Record<string, Schema>
      const surface = fields.surface?.const as string
      const owner = owners[surface]
      expect(owner).toBeDefined()
      expect(branch.additionalProperties).toBe(false)
      expect((branch.required as string[]).toSorted()).toEqual(
        ['image_id', owner!, 'surface', 'target_url'].toSorted(),
      )
      expect(fields.surface).toEqual({ const: surface })
      expect(fields[owner!]).toEqual({ format: 'uuid', type: 'string' })
      expect(fields.image_id).toEqual({ format: 'uuid', type: 'string' })
      expect(fields.target_url).toEqual({ type: 'string' })
    }
  })

  it.each([APPEALS, COUNTER_NOTICES])('%s bounds unique target_ids to 1-20 UUIDs', operation => {
    expect(properties(operation).target_ids).toEqual({
      items: { format: 'uuid', type: 'string' },
      maxItems: 20,
      minItems: 1,
      type: 'array',
      uniqueItems: true,
    })
  })

  it.each([APPEALS, COUNTER_NOTICES, ...PATH_ONLY])('%s declares the id path', operation => {
    const path = carriersOf(operation).path as { properties: Schema; required: string[] }
    expect(path.required).toEqual(['id'])
    expect(path.properties).toEqual({ id: { type: 'string' } })
  })

  it.each(PATH_ONLY)('%s validates no body or query carrier', operation => {
    expect(Object.keys(carriersOf(operation))).toEqual(['path'])
  })

  it('declares the accepted-notices query with the parser limit bounds', () => {
    const query = carriersOf('GET:/api/v1/copyright-notices').query as { properties: Schema }
    expect(query.properties).toEqual({
      after: { type: 'string' },
      limit: { default: 100, maximum: 100, minimum: 1, type: 'integer' },
    })
  })
})
