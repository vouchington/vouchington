import { describe, expect, it } from 'vitest'
import { asDataPoint } from './data-point-facts.mts'
import { asBoolean, asEnum, asIdList, asText, asTimestamp } from './revision-scalars.mts'

describe('post revision fact guards', () => {
  it('rejects scalar values that are not the declared type', () => {
    expect(() => asIdList('topic', 'topic_ids')).toThrow('array of ids')
    expect(() => asText(1, 'name')).toThrow('text or null')
    expect(() => asEnum('nope', 'post_type', new Set(['discussion']))).toThrow('unknown value')
    expect(() => asBoolean(1, 'noindex')).toThrow('boolean or null')
    expect(() => asTimestamp('yesterday', 'deleted_at')).toThrow('timestamp')
  })

  it('rejects malformed structured-data money', () => {
    expect(() => asDataPoint({ vertical: 'credit_card', stated_income_range: 'bad' })).toThrow(
      'stated_income_range',
    )
    expect(
      asDataPoint({
        vertical: 'credit_card',
        stated_income_range: {
          minimum: { amount: 1, currency: 'USD' },
          maximum: null,
        },
      }).incomeMaxAbsent,
    ).toBe(true)
    expect(() => asDataPoint({ vertical: 'credit_card', credit_limit: { amount: 'x' } })).toThrow(
      'credit_limit',
    )
  })
})
