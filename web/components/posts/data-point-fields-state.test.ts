import { describe, expect, it } from 'vitest'
import { changeStructuredDataCurrency, prepareDataForVertical } from './data-point-fields-state'
import { getPostStructuredData } from './post-form/structured-data'
import type { FinancialProfile } from '@/types/my'

const usdProfile: FinancialProfile = {
  user_id: 'user-1',
  currency: 'usd',
  credit_score_range: '700-749',
  stated_income_range: {
    minimum: { amount: 5_000_000, currency: 'usd' },
    maximum: { amount: 7_500_000, currency: 'usd' },
  },
  total_credit_limit: { amount: 1_000_000, currency: 'usd' },
  years_of_credit_history: 5,
  hard_inquiries_12m: 2,
  cards_opened_24m: 3,
  updated_at: '2024-01-15T10:00:00Z',
}

describe('data point field state', () => {
  it('does not seed USD profile money when JPY is selected before the vertical', () => {
    expect(
      prepareDataForVertical(
        'credit_card',
        {
          currency: 'jpy',
          stated_income_range: null,
          total_credit_limit_all_cards: null,
        },
        usdProfile,
      ),
    ).toEqual({
      currency: 'jpy',
      credit_score_range: '700-749',
      hard_inquiries_12m: 2,
      cards_opened_24m: 3,
      years_of_credit_history: 5,
      stated_income_range: null,
      total_credit_limit_all_cards: null,
    })
  })

  it('seeds profile money when the record and profile currencies match', () => {
    expect(prepareDataForVertical('credit_card', { currency: 'usd' }, usdProfile)).toMatchObject({
      stated_income_range: usdProfile.stated_income_range,
      total_credit_limit_all_cards: usdProfile.total_credit_limit,
    })
  })

  it('removes a non-null credit-card limit when switching to bank account', () => {
    expect(
      prepareDataForVertical(
        'bank_account',
        {
          currency: 'usd',
          total_credit_limit_all_cards: usdProfile.total_credit_limit,
        },
        null,
      ),
    ).not.toHaveProperty('total_credit_limit_all_cards')
  })

  it('clears structured money with explicit profile-sync nulls when currency changes', () => {
    expect(
      changeStructuredDataCurrency(
        {
          currency: 'usd',
          credit_limit: { amount: 50_000, currency: 'usd' },
          stated_income_range: usdProfile.stated_income_range,
          total_credit_limit_all_cards: usdProfile.total_credit_limit,
          credit_score_range: '700-749',
        },
        'jpy',
      ),
    ).toEqual({
      currency: 'jpy',
      credit_score_range: '700-749',
      stated_income_range: null,
      total_credit_limit_all_cards: null,
    })
  })

  it('keeps a bank-account currency change schema-valid through submission serialization', () => {
    const changed = prepareDataForVertical(
      'bank_account',
      changeStructuredDataCurrency(
        {
          currency: 'usd',
          bonus_amount: { amount: 50_000, currency: 'usd' },
          minimum_balance_requirement: { amount: 10_000, currency: 'usd' },
          stated_income_range: usdProfile.stated_income_range,
          total_credit_limit_all_cards: usdProfile.total_credit_limit,
          account_type: 'checking',
        },
        'jpy',
      ),
      usdProfile,
    )

    expect(changed).toEqual({
      currency: 'jpy',
      credit_score_range: '700-749',
      stated_income_range: null,
      total_credit_limit_all_cards: null,
      account_type: 'checking',
    })
    expect(
      getPostStructuredData({
        structuredData: changed,
        dataPointVertical: 'bank_account',
      }),
    ).toEqual({
      currency: 'jpy',
      credit_score_range: '700-749',
      stated_income_range: null,
      account_type: 'checking',
      topic_name: undefined,
      vertical: 'bank_account',
      schema_version: 1,
    })
  })
})
