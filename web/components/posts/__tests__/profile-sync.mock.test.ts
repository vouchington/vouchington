import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMyFinancialProfile } from '@/lib/api/client/financial-profile'
import { updateProfileFromStructuredData } from '../post-form/profile-sync'
import { changeStructuredDataCurrency, prepareDataForVertical } from '../data-point-fields-state'
import { getPostStructuredData } from '../post-form/structured-data'
import type { FinancialProfile } from '@/types/my'

vi.mock(import('@/lib/api/client/financial-profile'), () => ({
  updateMyFinancialProfile: vi.fn<VitestLooseMock>(),
}))

const currentProfile: FinancialProfile = {
  user_id: 'user-1',
  currency: 'usd',
  credit_score_range: null,
  stated_income_range: {
    minimum: { amount: 5_000_000, currency: 'usd' },
    maximum: { amount: 7_500_000, currency: 'usd' },
  },
  total_credit_limit: { amount: 1_000_000, currency: 'usd' },
  years_of_credit_history: null,
  hard_inquiries_12m: null,
  cards_opened_24m: null,
  updated_at: '2026-07-25T00:00:00.000Z',
}

describe('updateProfileFromStructuredData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('synchronizes currency-aware monetary profile fields', async () => {
    await updateProfileFromStructuredData({
      currency: 'jpy',
      stated_income_range: {
        minimum: { amount: 3_000_000, currency: 'jpy' },
        maximum: { amount: 5_000_000, currency: 'jpy' },
      },
      total_credit_limit_all_cards: { amount: 2_000_000, currency: 'jpy' },
    })

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'jpy',
      stated_income_range: {
        minimum: { amount: 3_000_000, currency: 'jpy' },
        maximum: { amount: 5_000_000, currency: 'jpy' },
      },
      total_credit_limit: { amount: 2_000_000, currency: 'jpy' },
    })
  })

  it('forwards explicit nulls so a currency change clears profile money', async () => {
    await updateProfileFromStructuredData({
      currency: 'jpy',
      stated_income_range: null,
      total_credit_limit_all_cards: null,
    })

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'jpy',
      stated_income_range: null,
      total_credit_limit: null,
    })
  })

  it('clears an omitted total credit limit when replacing an existing profile currency', async () => {
    await updateProfileFromStructuredData(
      {
        currency: 'jpy',
        stated_income_range: {
          minimum: { amount: 3_000_000, currency: 'jpy' },
          maximum: null,
        },
      },
      currentProfile,
    )

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'jpy',
      stated_income_range: {
        minimum: { amount: 3_000_000, currency: 'jpy' },
        maximum: null,
      },
      total_credit_limit: null,
    })
  })

  it('clears an omitted income range when replacing an existing profile currency', async () => {
    await updateProfileFromStructuredData(
      {
        currency: 'jpy',
        total_credit_limit_all_cards: { amount: 2_000_000, currency: 'jpy' },
      },
      currentProfile,
    )

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'jpy',
      stated_income_range: null,
      total_credit_limit: { amount: 2_000_000, currency: 'jpy' },
    })
  })

  it('clears both monetary fields when only an existing profile currency is replaced', async () => {
    await updateProfileFromStructuredData({ currency: 'jpy' }, currentProfile)

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'jpy',
      stated_income_range: null,
      total_credit_limit: null,
    })
  })

  it('preserves omitted fields during an unchanged-currency partial update', async () => {
    await updateProfileFromStructuredData(
      {
        currency: 'usd',
        stated_income_range: {
          minimum: { amount: 6_000_000, currency: 'usd' },
          maximum: null,
        },
      },
      currentProfile,
    )

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'usd',
      stated_income_range: {
        minimum: { amount: 6_000_000, currency: 'usd' },
        maximum: null,
      },
    })
  })

  it.each([
    {
      name: 'currency change before selecting bank account',
      makeState: () =>
        prepareDataForVertical(
          'bank_account',
          changeStructuredDataCurrency({ currency: 'usd' }, 'jpy'),
          null,
        ),
    },
    {
      name: 'credit-card currency change followed by switching to bank account',
      makeState: () =>
        prepareDataForVertical(
          'bank_account',
          changeStructuredDataCurrency(
            {
              currency: 'usd',
              total_credit_limit_all_cards: { amount: 1_000_000, currency: 'usd' },
              credit_limit: { amount: 500_000, currency: 'usd' },
            },
            'jpy',
          ),
          null,
        ),
    },
  ])('keeps profile clears but omits credit-card fields after $name', async ({ makeState }) => {
    const internalState = makeState()

    await updateProfileFromStructuredData(internalState)

    expect(updateMyFinancialProfile).toHaveBeenCalledWith({
      currency: 'jpy',
      stated_income_range: null,
      total_credit_limit: null,
    })
    const postStructuredData = getPostStructuredData({
      structuredData: internalState,
      dataPointVertical: 'bank_account',
    })
    expect(postStructuredData).toMatchObject({
      currency: 'jpy',
      stated_income_range: null,
      vertical: 'bank_account',
      schema_version: 1,
    })
    expect(postStructuredData).not.toHaveProperty('total_credit_limit_all_cards')
  })

  it('retains the credit-card profile clear in credit-card post serialization', () => {
    expect(
      getPostStructuredData({
        structuredData: {
          currency: 'jpy',
          stated_income_range: null,
          total_credit_limit_all_cards: null,
        },
        dataPointVertical: 'credit_card',
      }),
    ).toMatchObject({
      stated_income_range: null,
      total_credit_limit_all_cards: null,
      vertical: 'credit_card',
    })
  })
})
