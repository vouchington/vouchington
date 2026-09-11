import { describe, expect, it } from 'vitest'
import {
  BANK_ACCOUNT_SCHEMA,
  CREDIT_CARD_SCHEMA,
  currencyCodeSchema,
  moneyRangeSchema,
  moneySchema,
} from './json-schemas.mts'

describe('data point monetary schemas', () => {
  it('uses nested money values and a record currency for credit cards', () => {
    expect(CREDIT_CARD_SCHEMA.required).toContain('currency')
    expect(CREDIT_CARD_SCHEMA.properties.currency).toBe(currencyCodeSchema)
    expect(CREDIT_CARD_SCHEMA.properties.credit_limit).toEqual({
      anyOf: [{ type: 'null' }, moneySchema],
    })
    expect(CREDIT_CARD_SCHEMA.properties.total_credit_limit_all_cards).toEqual({
      anyOf: [{ type: 'null' }, moneySchema],
    })
  })

  it('uses nested money values and free money ranges for bank accounts', () => {
    expect(BANK_ACCOUNT_SCHEMA.required).toContain('currency')
    expect(BANK_ACCOUNT_SCHEMA.properties.stated_income_range).toEqual({
      anyOf: [{ type: 'null' }, moneyRangeSchema],
    })
    expect(BANK_ACCOUNT_SCHEMA.properties.bonus_amount).toEqual({
      anyOf: [{ type: 'null' }, moneySchema],
    })
    expect(BANK_ACCOUNT_SCHEMA.properties.minimum_balance_requirement).toEqual({
      anyOf: [{ type: 'null' }, moneySchema],
    })
  })
})
