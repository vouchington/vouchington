import { describe, expect, it } from 'vitest'
import { getBoundedPositiveIntegerField } from './dynamic-config-fields.mts'

const limits = { defaultValue: 10, maxValue: 100 }

function configWith(value?: boolean | number | string) {
  const fields = new Map<string, boolean | number | string>()
  if (value !== undefined) fields.set('page_size', value)
  return { fields }
}

describe('getBoundedPositiveIntegerField', () => {
  it('returns the default when the field is missing', () => {
    expect(getBoundedPositiveIntegerField(configWith(), 'page_size', limits)).toBe(10)
  })

  it.each([
    ['a non-integer', 1.5],
    ['zero', 0],
    ['a negative integer', -3],
    ['a value above the maximum', 101],
    ['Infinity', Infinity],
    ['NaN', Number.NaN],
    ['a numeric string', '5'],
    ['a boolean', true],
  ])('returns the default for %s', (_name, value) => {
    expect(getBoundedPositiveIntegerField(configWith(value), 'page_size', limits)).toBe(10)
  })

  it.each([1, 42, 100])('returns the valid stored value %s, including the maximum', value => {
    expect(getBoundedPositiveIntegerField(configWith(value), 'page_size', limits)).toBe(value)
  })

  it('reads only the requested field', () => {
    const config = configWith(7)
    expect(getBoundedPositiveIntegerField(config, 'other_field', limits)).toBe(10)
  })
})
