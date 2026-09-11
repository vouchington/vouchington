import { describe, expect, it } from 'vitest'
import { parseMajorUnitMoneyDraft } from './money-input-draft'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'

describe('parseMajorUnitMoneyDraft', () => {
  it.each(['', '0', '12', '12.', '12.3', '12.34'])('accepts USD draft %j', draft => {
    expect(parseMajorUnitMoneyDraft(draft, 'usd', 'en').accepted).toBe(true)
  })

  it.each(['.5', '00', '01', '12.345', '12a', '-1', '1e2', '1,000'])(
    'rejects non-canonical USD draft %j',
    draft => {
      expect(parseMajorUnitMoneyDraft(draft, 'usd', 'en')).toEqual({ accepted: false })
    },
  )

  it.each(['', '0', '12'])('accepts JPY draft %j', draft => {
    expect(parseMajorUnitMoneyDraft(draft, 'jpy', 'en').accepted).toBe(true)
  })

  it.each(['.5', '00', '12.', '12.0'])(
    'rejects fractional or non-canonical JPY draft %j',
    draft => {
      expect(parseMajorUnitMoneyDraft(draft, 'jpy', 'en')).toEqual({ accepted: false })
    },
  )

  it('parses a trailing dot as semantic whole-unit money', () => {
    expect(parseMajorUnitMoneyDraft('12.', 'usd', 'en')).toEqual({
      accepted: true,
      money: { amount: 1200, currency: 'usd' },
    })
  })

  it('accepts the exact exponent-two maximum and rejects the next minor unit', () => {
    expect(parseMajorUnitMoneyDraft('90071992547409.91', 'usd', 'en')).toEqual({
      accepted: true,
      money: { amount: MAX_MONEY_AMOUNT, currency: 'usd' },
    })
    expect(parseMajorUnitMoneyDraft('90071992547409.92', 'usd', 'en')).toEqual({
      accepted: false,
    })
  })

  it('accepts the exact JPY maximum and rejects the next whole unit', () => {
    expect(parseMajorUnitMoneyDraft('9007199254740991', 'jpy', 'en')).toEqual({
      accepted: true,
      money: { amount: MAX_MONEY_AMOUNT, currency: 'jpy' },
    })
    expect(parseMajorUnitMoneyDraft('9007199254740992', 'jpy', 'en')).toEqual({
      accepted: false,
    })
  })

  it.each(['es', 'fr', 'pt'])('accepts the %s comma decimal separator', locale => {
    expect(parseMajorUnitMoneyDraft('12,34', 'usd', locale)).toEqual({
      accepted: true,
      money: { amount: 1234, currency: 'usd' },
    })
    expect(parseMajorUnitMoneyDraft('12,', 'usd', locale)).toEqual({
      accepted: true,
      money: { amount: 1200, currency: 'usd' },
    })
  })

  it.each(['es', 'fr', 'pt'])('also accepts canonical dot decimals in %s', locale => {
    expect(parseMajorUnitMoneyDraft('12.34', 'usd', locale)).toEqual({
      accepted: true,
      money: { amount: 1234, currency: 'usd' },
    })
  })

  it.each([
    ['en', '12,345.67'],
    ['es', '12.345,67'],
    ['fr', '12\u202F345,67'],
    ['fr', '12\u00A0345,67'],
    ['fr', '12 345,67'],
    ['pt', '12.345,67'],
  ])('rejects grouping in %s draft %j', (locale, draft) => {
    expect(parseMajorUnitMoneyDraft(draft, 'usd', locale)).toEqual({ accepted: false })
  })

  it.each(['es', 'fr', 'pt'])('rejects mixed decimal separators in %s', locale => {
    expect(parseMajorUnitMoneyDraft('12.3,4', 'usd', locale)).toEqual({ accepted: false })
  })
})
