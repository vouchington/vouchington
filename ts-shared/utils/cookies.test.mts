import { describe, expect, it } from 'vitest'
import { parseCookies } from './index.mts'

describe('parseCookies', () => {
  it('splits a Cookie header into names and values', () => {
    const parsed = parseCookies('foo=bar; st=token; dt=abc')

    expect(parsed.get('foo')).toBe('bar')
    expect(parsed.get('st')).toBe('token')
    expect(parsed.get('dt')).toBe('abc')
  })

  it('returns an empty map for a missing header', () => {
    expect(parseCookies(undefined).size).toBe(0)
    expect(parseCookies(null).size).toBe(0)
    expect(parseCookies('').size).toBe(0)
  })
})
