import { describe, expect, it } from 'vitest'
import { MAX_POINT_VALUE_MICROUNITS } from '@ts-shared/money'
import { parsePointValuationInput } from './edit-form'

describe('parsePointValuationInput', () => {
  it('accepts the point-valuation business maximum', () => {
    expect(parsePointValuationInput('9999.999999', 'usd', 'en')).toEqual({
      amount: MAX_POINT_VALUE_MICROUNITS,
      currency: 'usd',
      scale: 6,
    })
  })

  it('rejects one microunit above the point-valuation business maximum', () => {
    expect(() => parsePointValuationInput('10000', 'usd', 'en')).toThrow(RangeError)
  })

  it('parses a comma-decimal point valuation without losing microunits', () => {
    expect(parsePointValuationInput('0,035', 'usd', 'fr')).toEqual({
      amount: 35_000,
      currency: 'usd',
      scale: 6,
    })
  })

  it.each(['es', 'pt'])('rejects an ambiguous grouped-looking dot value in %s', locale => {
    expect(() => parsePointValuationInput('9.999', 'usd', locale)).toThrow(
      /^Money must not contain an ambiguous grouping separator$/,
    )
  })

  it.each(['es', 'pt'])('keeps an unambiguous canonical dot valuation in %s', locale => {
    expect(parsePointValuationInput('0.035', 'usd', locale)).toEqual({
      amount: 35_000,
      currency: 'usd',
      scale: 6,
    })
  })
})
