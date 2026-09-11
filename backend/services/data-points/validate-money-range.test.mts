import { describe, expect, it } from 'vitest'
import { assertValidStructuredData } from './validate.mts'

const validCreditCard = {
  vertical: 'credit_card',
  schema_version: 1,
  currency: 'usd',
  topic_ids: ['01234567-89ab-7def-0123-456789abcdef'],
  result: 'approved',
  credit_score_range: '670-739',
}

describe('assertValidStructuredData stated_income_range', () => {
  it('rejects equal bounds', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'usd' },
          maximum: { amount: 5_000_000, currency: 'usd' },
        },
      }),
    ).toThrow('stated_income_range must be a valid money range')
  })

  it('rejects a maximum below the minimum', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'usd' },
          maximum: { amount: 4_999_999, currency: 'usd' },
        },
      }),
    ).toThrow('stated_income_range must be a valid money range')
  })

  it('rejects mismatched currencies', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'usd' },
          maximum: { amount: 7_500_000, currency: 'cad' },
        },
      }),
    ).toThrow('stated_income_range must be a valid money range')
  })

  it('accepts an open-ended range', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        stated_income_range: {
          minimum: { amount: 5_000_000, currency: 'usd' },
          maximum: null,
        },
      }),
    ).not.toThrow()
  })
})
