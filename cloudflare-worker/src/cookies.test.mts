import { describe, expect, it } from 'vitest'
import { parseCookies, replaceSessionCookies, stripCookies } from './cookies.mts'

describe('cookies', () => {
  it('parses cookie header into map', () => {
    const parsed = parseCookies('foo=bar; st=token; dt=abc')

    expect(parsed.get('foo')).toBe('bar')
    expect(parsed.get('st')).toBe('token')
    expect(parsed.get('dt')).toBe('abc')
  })

  it('strips selected cookies', () => {
    const stripped = stripCookies('foo=bar; st=token; dt=abc', new Set(['st', 'dt']))

    expect(stripped).toBe('foo=bar')
  })

  it('ignores malformed cookie segments and empty names', () => {
    const parsed = parseCookies('foo=bar; missing-equals; =empty;  =blank; spaced = value ')
    const emptyName = parseCookies(' =blank')

    expect(parsed.get('foo')).toBe('bar')
    expect(parsed.get('spaced')).toBe('value')
    expect(parsed.has('missing-equals')).toBe(false)
    expect(parsed.has('')).toBe(false)
    expect(emptyName.size).toBe(0)
  })

  it('replaces only the provided session cookies', () => {
    expect(replaceSessionCookies('foo=bar; st=old', { dt: 'new-dt' })).toBe(
      'foo=bar; st=old; dt=new-dt',
    )
    expect(replaceSessionCookies(null, { st: 'new-st' })).toBe('st=new-st')
  })

  it('rejects replacement values that could inject additional cookies', () => {
    expect(() => replaceSessionCookies('foo=bar', { dt: 'new-dt; injected=cookie' })).toThrow(
      'Invalid cookie value for dt',
    )
  })

  it.each(['new-st\ninjected=cookie', 'new-st\rInjected: header', 'new-st\u0000suffix'])(
    'rejects replacement values with control characters: %j',
    value => {
      expect(() => replaceSessionCookies('foo=bar', { st: value })).toThrow(
        'Invalid cookie value for st',
      )
    },
  )

  it('returns null when all cookies are stripped', () => {
    expect(stripCookies('st=token; dt=abc', new Set(['st', 'dt']))).toBeNull()
  })
})
