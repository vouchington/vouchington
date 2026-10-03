import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  BODIES,
  FORM_INTAKE_REVIEW,
  LEGAL_HOLD_RESOLUTION,
  PATH_ONLY,
  RESTRICTION_REVIEW,
  SIMILARITY_CANDIDATES,
} from './copyright-staff-decision-request-contract-coverage.mts'

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

function pathIdsOf(operation: string) {
  const path = carriersOf(operation).path as { properties: Schema; required: string[] }
  expect(Object.keys(path.properties).toSorted()).toEqual(path.required.toSorted())
  return path.required.toSorted()
}

describe('copyright staff decision request contracts', () => {
  it.each(Object.entries(BODIES))('%s declares a closed body', (operation, { required }) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect((schema.required as string[]).toSorted()).toEqual(required)
    expect(Object.keys(propertiesOf(operation)).toSorted()).toEqual(required)
    expect(propertiesOf(operation).rationale).toEqual({ type: 'string' })
  })

  it('declares the form-intake outcome as a boolean', () => {
    expect(propertiesOf(FORM_INTAKE_REVIEW).accepted).toEqual({ type: 'boolean' })
  })

  it('declares the restriction action as confirm or reverse', () => {
    expect(propertiesOf(RESTRICTION_REVIEW).action).toEqual({
      enum: ['confirm', 'reverse'],
      type: 'string',
    })
  })

  it('declares the legal-hold resolution kinds', () => {
    expect(propertiesOf(LEGAL_HOLD_RESOLUTION).resolution_kind).toEqual({
      enum: ['dismissed', 'proceeding_ended', 'superseded'],
      type: 'string',
    })
  })

  it.each(Object.keys(BODIES))('%s declares its path id', operation => {
    expect(pathIdsOf(operation)).toEqual(
      operation.includes('restrictions') ? ['id', 'restrictionId'] : ['id'],
    )
  })

  it.each(Object.entries(PATH_ONLY))('%s declares only its path ids', (operation, ids) => {
    const carriers = carriersOf(operation)
    expect(carriers.body).toBeUndefined()
    expect(carriers.query).toBeUndefined()
    expect(pathIdsOf(operation)).toEqual(ids.toSorted())
  })

  it('declares the similarity limit as a bounded integer and nothing else in the query', () => {
    const carriers = carriersOf(SIMILARITY_CANDIDATES)
    expect(carriers.body).toBeUndefined()
    expect(pathIdsOf(SIMILARITY_CANDIDATES)).toEqual(['id', 'targetId'])
    expect(carriers.query).toEqual({
      properties: { limit: { maximum: 50, minimum: 1, type: 'integer' } },
      type: 'object',
    })
  })
})
