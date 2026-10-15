import { describe, expect, it } from 'vitest'
import { pruningLifecycleConnectionUrl } from './database-lifecycle-scope.mts'

describe('pruning lifecycle libpq connection URI', () => {
  it('percent-encodes timeout options while preserving credentials and existing parameters', () => {
    const original = new URL(
      'postgres://fixture%2Buser:fixture%20pass%2B@localhost/owned?options=-c%20application_name%3Downed%20fixture%2Bliteral&application_name=fixture%20space%2Bliteral&sslmode=disable',
    )
    const result = new URL(pruningLifecycleConnectionUrl(original.href, 24_999))
    const parameters = Object.fromEntries(
      result.search
        .slice(1)
        .split('&')
        .map(parameter => {
          const separator = parameter.indexOf('=')
          return [
            decodeURIComponent(parameter.slice(0, separator)),
            decodeURIComponent(parameter.slice(separator + 1)),
          ]
        }),
    )
    expect(result.search).not.toContain('+')
    expect(parameters).toEqual({
      options: '-c application_name=owned fixture+literal -c statement_timeout=24999ms',
      application_name: 'fixture space+literal',
      sslmode: 'disable',
      connect_timeout: '5',
    })
    expect(result.username).toBe(original.username)
    expect(result.password).toBe(original.password)
    expect(result.pathname).toBe(original.pathname)
  })

  it('preserves raw query plus signs without changing userinfo or path plus signs', () => {
    const original = new URL(
      'postgres://fixture+user:fixture+pass@localhost/owned+name?application_name=raw+plus&options=-c%20application_name=raw+plus&other=encoded%2Bplus%20space',
    )
    const result = new URL(pruningLifecycleConnectionUrl(original.href, 9_999))
    expect(result.username).toBe(original.username)
    expect(result.password).toBe(original.password)
    expect(result.pathname).toBe(original.pathname)
    const parameters = Object.fromEntries(
      result.search
        .slice(1)
        .split('&')
        .map(parameter => {
          const separator = parameter.indexOf('=')
          return [
            decodeURIComponent(parameter.slice(0, separator)),
            decodeURIComponent(parameter.slice(separator + 1)),
          ]
        }),
    )
    expect(parameters).toEqual({
      application_name: 'raw+plus',
      options: '-c application_name=raw+plus -c statement_timeout=9999ms',
      other: 'encoded+plus space',
      connect_timeout: '5',
    })
  })

  it('uses the remaining cleanup budget for both statement and connection limits', () => {
    const result = new URL(pruningLifecycleConnectionUrl('postgres://localhost/owned', 1_999))
    const serializedOptions = result.search
      .slice(1)
      .split('&')
      .find(value => value.startsWith('options='))
    expect(decodeURIComponent(serializedOptions?.slice('options='.length) ?? '')).toBe(
      ' -c statement_timeout=1999ms',
    )
    expect(result.searchParams.get('connect_timeout')).toBe('1')
  })
})
