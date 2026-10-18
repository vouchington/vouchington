import { describe, expect, it } from 'vitest'
import { replaceSessionCookies } from './cookies.mts'

describe('cookies', () => {
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
})
