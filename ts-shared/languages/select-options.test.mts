import { describe, expect, it } from 'vitest'
import { COUNTRY_SELECT_OPTIONS } from './select-options.mts'
import { SUPPORTED_COUNTRIES } from './countries.mts'

describe('COUNTRY_SELECT_OPTIONS', () => {
  it('exposes sorted country options for every supported country', () => {
    expect(COUNTRY_SELECT_OPTIONS).toHaveLength(SUPPORTED_COUNTRIES.length)
    expect(COUNTRY_SELECT_OPTIONS).toContainEqual({ value: 'US', label: 'United States' })
    expect(COUNTRY_SELECT_OPTIONS.map(option => option.label)).toEqual(
      COUNTRY_SELECT_OPTIONS.map(option => option.label).toSorted((left, right) =>
        left.localeCompare(right),
      ),
    )
  })
})
