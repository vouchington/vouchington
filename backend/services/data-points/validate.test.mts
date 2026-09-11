import { describe, it, expect } from 'vitest'
import { assertValidStructuredData } from './validate.mts'

const VALID_CARD_ID = '01234567-89ab-7def-0123-456789abcdef'
const VALID_BANK_ACCOUNT_ID = '01234567-89ab-7def-0123-456789abcde0'
const VALID_TOPIC_IDS = [
  VALID_CARD_ID,
  '01234567-89ab-7def-0123-456789abcde1',
  '01234567-89ab-7def-0123-456789abcde2',
  '01234567-89ab-7def-0123-456789abcde3',
  '01234567-89ab-7def-0123-456789abcde4',
  '01234567-89ab-7def-0123-456789abcde5',
]

const validCreditCard = {
  vertical: 'credit_card',
  schema_version: 1,
  currency: 'usd',
  topic_ids: [VALID_CARD_ID],
  result: 'approved',
  credit_score_range: '670-739',
}

const validBankAccount = {
  vertical: 'bank_account',
  schema_version: 1,
  currency: 'usd',
  topic_ids: [VALID_BANK_ACCOUNT_ID],
  result: 'approved',
}

function expectStructuredDataAccepted(vertical: string, data: unknown) {
  let didThrow = false
  let thrown: unknown
  try {
    assertValidStructuredData(vertical, data)
  } catch (error) {
    didThrow = true
    thrown = error
  }
  expect({ didThrow, thrown }).toEqual({ didThrow: false, thrown: undefined })
}

describe('assertValidStructuredData - credit_card', () => {
  it('accepts a minimal valid credit card data point', () => {
    expectStructuredDataAccepted('credit_card', validCreditCard)
  })

  it('accepts all optional credit card fields', () => {
    expectStructuredDataAccepted('credit_card', {
      ...validCreditCard,
      stated_income_range: {
        minimum: { amount: 5_000_000, currency: 'usd' },
        maximum: { amount: 7_500_000, currency: 'usd' },
      },
      existing_relationship: true,
      hard_inquiries_12m: 2,
      cards_opened_24m: 3,
      credit_limit: { amount: 500_000, currency: 'usd' },
      total_credit_limit_all_cards: { amount: 1_000_000, currency: 'usd' },
      years_of_credit_history: 5,
      is_business_application: false,
      application_method: 'online',
      application_date: '2026-01-15',
    })
  })

  it('rejects missing result', () => {
    const { result: _r, ...noResult } = validCreditCard
    expect(() => assertValidStructuredData('credit_card', noResult)).toThrow(Error)
  })

  it('rejects invalid result', () => {
    expect(() =>
      assertValidStructuredData('credit_card', { ...validCreditCard, result: 'unknown' }),
    ).toThrow(Error)
  })

  it('rejects missing credit_score_range', () => {
    const { credit_score_range: _cr, ...noScore } = validCreditCard
    expect(() => assertValidStructuredData('credit_card', noScore)).toThrow(Error)
  })

  it('rejects invalid credit_score_range', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        credit_score_range: '500-600',
      }),
    ).toThrow(Error)
  })

  it('rejects negative hard_inquiries_12m', () => {
    expect(() =>
      assertValidStructuredData('credit_card', { ...validCreditCard, hard_inquiries_12m: -1 }),
    ).toThrow(Error)
  })

  it('rejects non-integer credit_limit', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        credit_limit: { amount: 1000.5, currency: 'usd' },
      }),
    ).toThrow(Error)
  })

  it('rejects invalid application_date format', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        application_date: '01/15/2026',
      }),
    ).toThrow(Error)
  })

  it('rejects impossible calendar date', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        application_date: '2026-02-30',
      }),
    ).toThrow(Error)
  })

  it('rejects fractional years_of_credit_history', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        years_of_credit_history: 5.5,
      }),
    ).toThrow(Error)
  })

  it('rejects invalid application_method', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        application_method: 'fax',
      }),
    ).toThrow(Error)
  })

  it('rejects non-UUID topic_ids', () => {
    expect(() =>
      assertValidStructuredData('credit_card', { ...validCreditCard, topic_ids: ['not-a-uuid'] }),
    ).toThrow(Error)
  })

  it('rejects empty topic_ids', () => {
    expect(() =>
      assertValidStructuredData('credit_card', { ...validCreditCard, topic_ids: [] }),
    ).toThrow(Error)
  })

  it('accepts the default maximum topic_ids count', () => {
    expectStructuredDataAccepted('credit_card', {
      ...validCreditCard,
      topic_ids: VALID_TOPIC_IDS.slice(0, 5),
    })
  })

  it('rejects topic_ids above the default maximum count', () => {
    expect(() =>
      assertValidStructuredData('credit_card', {
        ...validCreditCard,
        topic_ids: VALID_TOPIC_IDS.slice(0, 6),
      }),
    ).toThrow(Error)
  })

  it('accepts topic_ids above the default maximum when a higher runtime cap is provided', () => {
    expect(() =>
      assertValidStructuredData(
        'credit_card',
        {
          ...validCreditCard,
          topic_ids: VALID_TOPIC_IDS.slice(0, 6),
        },
        { topicIdsMaxItems: 6 },
      ),
    ).not.toThrow()
  })

  it('rejects wrong schema_version', () => {
    expect(() =>
      assertValidStructuredData('credit_card', { ...validCreditCard, schema_version: 2 }),
    ).toThrow(Error)
  })

  it('rejects mismatched vertical', () => {
    expect(() =>
      assertValidStructuredData('credit_card', { ...validCreditCard, vertical: 'bank_account' }),
    ).toThrow(Error)
  })
})

describe('assertValidStructuredData - bank_account', () => {
  it('accepts a minimal valid bank account data point', () => {
    expectStructuredDataAccepted('bank_account', validBankAccount)
  })

  it('accepts all optional bank account fields', () => {
    expectStructuredDataAccepted('bank_account', {
      ...validBankAccount,
      account_type: 'checking',
      credit_score_range: '740-799',
      currency: 'jpy',
      stated_income_range: {
        minimum: { amount: 7_500_000, currency: 'jpy' },
        maximum: { amount: 10_000_000, currency: 'jpy' },
      },
      existing_relationship: false,
      bonus_amount: { amount: 20_000, currency: 'jpy' },
      bonus_requirements: 'Spend $500 in 90 days',
      minimum_balance_requirement: { amount: 100_000, currency: 'jpy' },
      direct_deposit_setup: true,
      application_date: '2026-03-01',
    })
  })

  it('rejects missing result', () => {
    const { result: _r, ...noResult } = validBankAccount
    expect(() => assertValidStructuredData('bank_account', noResult)).toThrow(Error)
  })

  it('rejects invalid result', () => {
    expect(() =>
      assertValidStructuredData('bank_account', { ...validBankAccount, result: 'pending' }),
    ).toThrow(Error)
  })

  it('rejects invalid account_type', () => {
    expect(() =>
      assertValidStructuredData('bank_account', {
        ...validBankAccount,
        account_type: 'investment',
      }),
    ).toThrow(Error)
  })

  it('rejects bonus_requirements exceeding 500 chars', () => {
    expect(() =>
      assertValidStructuredData('bank_account', {
        ...validBankAccount,
        bonus_requirements: 'x'.repeat(501),
      }),
    ).toThrow(Error)
  })

  it('rejects negative bonus_amount', () => {
    expect(() =>
      assertValidStructuredData('bank_account', {
        ...validBankAccount,
        bonus_amount: { amount: -100, currency: 'usd' },
      }),
    ).toThrow(Error)
  })
})

describe('assertValidStructuredData - vertical validation', () => {
  it('rejects invalid vertical', () => {
    expect(() => assertValidStructuredData('mortgage', validCreditCard)).toThrow(Error)
  })

  it('rejects null data', () => {
    expect(() => assertValidStructuredData('credit_card', null)).toThrow(Error)
  })

  it('rejects non-object data', () => {
    expect(() => assertValidStructuredData('credit_card', 'string')).toThrow(Error)
  })
})
