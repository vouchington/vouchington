import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  APPEAL_REVIEW,
  COUNTER_NOTICE_REVIEW,
  LEGAL_HOLD_ASSESSMENT,
  MEDIA_DELIVERY_REPLAY,
  PATH_PARAMETERS,
  REQUIRED_KEYS,
} from './copyright-submission-review-request-contract-coverage.mts'

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

describe('copyright submission review request contracts', () => {
  it.each(Object.entries(REQUIRED_KEYS))('%s declares a closed body', (operation, required) => {
    const schema = resolve(carriersOf(operation).body)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect((schema.required as string[]).toSorted()).toEqual(required)
    expect(propertiesOf(operation).rationale).toEqual({ type: 'string' })
  })

  it.each(PATH_PARAMETERS)('%s declares its path id', operation => {
    const path = carriersOf(operation).path as { properties: Schema; required: string[] }
    expect(path.required).toEqual(['id'])
    expect(Object.keys(path.properties)).toEqual(['id'])
  })

  it('declares the appeal decisions as one to twenty closed restriction decisions', () => {
    const decisions = propertiesOf(APPEAL_REVIEW).decisions as Schema
    expect(decisions).toMatchObject({ type: 'array', minItems: 1, maxItems: 20 })
    const item = resolve(decisions.items as Schema)
    expect(item.additionalProperties).toBe(false)
    expect((item.required as string[]).toSorted()).toEqual(['action', 'restriction_id'])
    expect(item.properties).toEqual({
      action: { enum: ['confirm', 'reverse'], type: 'string' },
      restriction_id: { format: 'uuid', type: 'string' },
    })
  })

  it('declares the optional appeal recommendation as a uuid or null', () => {
    const properties = propertiesOf(APPEAL_REVIEW)
    expect(properties.recommendation_id).toEqual({
      anyOf: [{ format: 'uuid', type: 'string' }, { type: 'null' }],
    })
    expect(properties.manual_fallback_reason).toEqual({
      anyOf: [{ type: 'null' }, { type: 'string' }],
    })
  })

  it('declares the counter-notice outcome as a boolean', () => {
    expect(propertiesOf(COUNTER_NOTICE_REVIEW).is_accepted).toEqual({ type: 'boolean' })
  })

  it('declares the legal-hold target ids as one to twenty distinct uuids', () => {
    expect(propertiesOf(LEGAL_HOLD_ASSESSMENT).target_ids).toEqual({
      items: { format: 'uuid', type: 'string' },
      maxItems: 20,
      minItems: 1,
      type: 'array',
      uniqueItems: true,
    })
  })

  it('declares the legal-hold proceeding fields as optional, nullable and enumerated', () => {
    const properties = propertiesOf(LEGAL_HOLD_ASSESSMENT)
    expect(properties.proceeding_kind).toEqual({
      anyOf: [{ const: 'ccb' }, { const: 'federal_court' }, { type: 'null' }],
    })
    expect(properties.ccb_claim_kind).toEqual({
      anyOf: [{ const: 'claim' }, { const: 'counterclaim' }, { type: 'null' }],
    })
    for (const name of ['commenced_at', 'received_by_designated_agent_at']) {
      expect(properties[name]).toEqual({ anyOf: [{ type: 'null' }, { type: 'string' }] })
    }
  })

  // The route reads no body, path or query, so the compiler emits no operation and the handler
  // has nothing to validate. A carrier added later would appear here and need a contract call.
  it('keeps the media-delivery replay free of request carriers', () => {
    expect(bundle.operations[MEDIA_DELIVERY_REPLAY]).toBeUndefined()
  })
})
