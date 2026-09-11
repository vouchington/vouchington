import { describe, expect, it } from 'vitest'
import { applyMoneyContracts } from './openapi-money-contract.mts'
import type { OpenApiDocument, OpenApiSchema } from 'vouchington-tooling/openapi-document'
import { MAX_MONEY_AMOUNT, MAX_POINT_VALUE_MICROUNITS } from '@ts-shared/money'

function documentWithSchema(schema: OpenApiSchema): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'test', version: 'test' },
    paths: {},
    components: {
      schemas: { Subject: schema },
      responses: { Error: { description: 'Error' } },
    },
    'x-unavailable-routes': [],
    'x-unavailable-request-routes': [],
  }
}

describe('applyMoneyContracts', () => {
  it('makes Money and ScaledMoney schemas exact', () => {
    const money: OpenApiSchema = {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
      },
      required: ['amount', 'currency'],
    }
    const scaledMoney: OpenApiSchema = {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
        scale: { const: 6 },
      },
      required: ['amount', 'currency', 'scale'],
    }
    const document = documentWithSchema({
      type: 'object',
      properties: { money, scaledMoney },
    })

    applyMoneyContracts(document)

    expect(money.additionalProperties).toBe(false)
    expect(scaledMoney.additionalProperties).toBe(false)
    expect(money.properties?.amount?.maximum).toBe(MAX_MONEY_AMOUNT)
    expect(scaledMoney.properties?.amount?.maximum).toBe(MAX_MONEY_AMOUNT)
  })

  it('bounds point valuations to the shared service maximum', () => {
    const valuePerPoint: OpenApiSchema = {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
        scale: { const: 6 },
      },
      required: ['amount', 'currency', 'scale'],
    }
    const document = documentWithSchema({
      type: 'object',
      properties: { value_per_point: valuePerPoint },
    })

    applyMoneyContracts(document)

    expect(valuePerPoint.properties?.amount?.maximum).toBe(MAX_POINT_VALUE_MICROUNITS)
  })

  it('preserves exact aggregate amounts as canonical integer strings', () => {
    const aggregate: OpenApiSchema = {
      type: 'object',
      properties: {
        amount: { type: 'string' },
        currency: { type: 'string' },
        scale: { const: 6 },
      },
      required: ['amount', 'currency', 'scale'],
    }
    const document = documentWithSchema(aggregate)

    applyMoneyContracts(document)

    expect(aggregate.additionalProperties).toBe(false)
    expect(aggregate.properties?.amount).toEqual({
      type: 'string',
      pattern: '^(0|[1-9][0-9]*)$',
    })
  })

  it('does not weaken ordinary money when an inferred amount is a string', () => {
    const money: OpenApiSchema = {
      type: 'object',
      properties: {
        amount: { type: 'string' },
        currency: { type: 'string' },
      },
      required: ['amount', 'currency'],
    }
    const document = documentWithSchema(money)

    applyMoneyContracts(document)

    expect(money.properties?.amount).toEqual({
      type: 'integer',
      minimum: 0,
      maximum: MAX_MONEY_AMOUNT,
    })
  })
})
