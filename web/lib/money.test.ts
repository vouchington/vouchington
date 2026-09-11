import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatScaledMoney,
  formatScaledMoneyAggregate,
  formatScaledMoneyAggregateList,
  formatScaledMoneyList,
  majorUnitsInputValue,
  compatibleMoneyInputValue,
  monthlyEquivalent,
} from './money'

describe('web money formatting', () => {
  it('formats ordinary USD minor units without floating-point arithmetic', () => {
    expect(formatMoney({ amount: 12_345, currency: 'usd' }, 'en-US')).toBe('$123.45')
  })

  it('formats zero-decimal JPY', () => {
    expect(formatMoney({ amount: 12_345, currency: 'jpy' }, 'en-US')).toBe('¥12,345')
  })

  it('formats a six-decimal point value exactly', () => {
    expect(formatScaledMoney({ amount: 35_000, currency: 'usd', scale: 6 }, 'en-US')).toBe('$0.035')
  })

  it('preserves all scale-six digits at the JSON safe integer maximum', () => {
    expect(
      formatScaledMoney({ amount: Number.MAX_SAFE_INTEGER, currency: 'usd', scale: 6 }, 'en-US'),
    ).toBe('$9,007,199,254.740991')
  })

  it('formats exact scaled aggregates beyond the JSON-safe integer range', () => {
    expect(
      formatScaledMoneyAggregate(
        { amount: '180143985094819820000', currency: 'usd', scale: 6 },
        'en-US',
      ),
    ).toBe('$180,143,985,094,819.82')
    expect(formatScaledMoneyAggregateList([], 'en-US')).toBe('0')
  })

  it('formats an empty scaled-money list as an explicit zero', () => {
    expect(formatScaledMoneyList([], 'en-US')).toBe('0')
  })

  it('returns canonical major-unit input strings', () => {
    expect(majorUnitsInputValue({ amount: 35_000, currency: 'usd', scale: 6 })).toBe('0.035')
    expect(majorUnitsInputValue({ amount: 12_300, currency: 'usd' })).toBe('123')
    expect(majorUnitsInputValue({ amount: 12_345, currency: 'usd' })).toBe('123.45')
    expect(majorUnitsInputValue({ amount: 12_345, currency: 'jpy' })).toBe('12345')
  })

  it('derives input precision and clears drafts unsupported by a selected currency', () => {
    expect(compatibleMoneyInputValue('12.34', 'jpy', 'en')).toBe('')
    expect(compatibleMoneyInputValue('12.00', 'jpy', 'en')).toBe('')
    expect(compatibleMoneyInputValue('12.', 'jpy', 'en')).toBe('')
    expect(compatibleMoneyInputValue('12.34', 'usd', 'en')).toBe('12.34')
    expect(compatibleMoneyInputValue('12,34', 'usd', 'es')).toBe('12,34')
  })

  it('formats a yearly price as an exact rounded monthly equivalent', () => {
    expect(monthlyEquivalent({ amount: 10_000, currency: 'usd' }, 'en-US')).toBe('$8.333333')
    expect(monthlyEquivalent({ amount: Number.MAX_SAFE_INTEGER, currency: 'usd' }, 'en-US')).toBe(
      '$7,505,999,378,950.825833',
    )
  })
})
