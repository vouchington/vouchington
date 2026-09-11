import { it, expect, describe } from 'vitest'
import { getCountries } from './countries.mts'

describe('countries', () => {
  it('getCountries returns a non-empty list including known seeds', async () => {
    const countries = await getCountries()
    expect(countries.length).toBeGreaterThan(0)
    expect(countries.some(c => c.code === 'US')).toBe(true)
  })

  it('getCountries returns rows with id, code, and name', async () => {
    const countries = await getCountries()
    const us = countries.find(c => c.code === 'US')
    expect(us).toBeDefined()
    expect(typeof us!.id).toBe('number')
    expect(typeof us!.code).toBe('string')
    expect(typeof us!.name).toBe('string')
  })
})
