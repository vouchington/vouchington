import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  APPROVAL,
  ATTESTATIONS,
  CORRESPONDENCE,
  ENUMS,
  PATH_PARAMETERS,
  QUEUE,
  REPLY_REPLAY,
  REQUIRED_KEYS,
} from './copyright-email-intake-request-contract-coverage.mts'

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

function propertiesOf(operation: string) {
  return resolve(carriersOf(operation).body).properties as Record<string, Schema>
}

describe('copyright email intake request contracts', () => {
  it.each(Object.entries(REQUIRED_KEYS))('%s declares a closed body', (operation, required) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect((schema.required as string[]).toSorted()).toEqual(required)
    expect(propertiesOf(operation).rationale).toEqual({ type: 'string' })
  })

  it.each(Object.entries(ENUMS))(
    '%s limits its enumerated field',
    (operation, { field, values }) => {
      expect((propertiesOf(operation)[field]!.enum as string[]).toSorted()).toEqual(values)
    },
  )

  it.each(Object.entries(ATTESTATIONS))(
    '%s accepts only a true attestation',
    (operation, names) => {
      for (const name of names) expect(propertiesOf(operation)[name]).toEqual({ const: true })
    },
  )

  it.each(PATH_PARAMETERS)('%s declares its path id', operation => {
    const path = carriersOf(operation).path as { properties: Schema; required: string[] }
    expect(path.required).toEqual(['id'])
    expect(Object.keys(path.properties)).toEqual(['id'])
  })

  it('declares the approval targets as one to twenty closed hosted surfaces', () => {
    const targets = propertiesOf(APPROVAL).targets as Schema
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

  it('declares the correspondence target ids as one to twenty distinct uuids', () => {
    expect(propertiesOf(CORRESPONDENCE).target_ids).toEqual({
      items: { format: 'uuid', type: 'string' },
      maxItems: 20,
      minItems: 1,
      type: 'array',
      uniqueItems: true,
    })
  })

  it('declares the reply replay with a path carrier only', () => {
    expect(Object.keys(carriersOf(REPLY_REPLAY))).toEqual(['path'])
  })

  it('declares the review queue query with the parser limit bounds', () => {
    const query = carriersOf(QUEUE).query as { properties: Schema }
    expect(query.properties).toEqual({
      after: { type: 'string' },
      limit: { default: 100, maximum: 100, minimum: 1, type: 'integer' },
    })
  })
})
