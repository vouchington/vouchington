import { describe, expect, it } from 'vitest'
import { ClientInfoValidationError, parseClientHeaders } from './index.mts'

describe('request client information contract', () => {
  it('parses compatible client metadata', () => {
    expect(
      parseClientHeaders({
        'x-voucha-client': 'swift',
        'x-voucha-platform': 'ios',
        'x-voucha-app-version': '1.2.3 (42)',
        'x-voucha-sdk-version': '2.0.0',
      }),
    ).toEqual({ client: 'swift', platform: 'ios', appVersion: '1.2.3 (42)', sdkVersion: '2.0.0' })
  })

  it('uses the canonical Windows platform name for .NET clients', () => {
    expect(
      parseClientHeaders({
        'x-voucha-client': 'dotnet',
        'x-voucha-platform': 'windows',
        'x-voucha-app-version': '1.0+1',
      }),
    ).toEqual({ client: 'dotnet', platform: 'windows', appVersion: '1.0+1' })
  })

  it('preserves the validation error class, metadata, and exact message contract', () => {
    let caught: unknown
    try {
      parseClientHeaders({})
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ClientInfoValidationError)
    expect(caught).toMatchObject({
      name: 'ClientInfoValidationError',
      code: 'INVALID_CLIENT_INFO',
      status: 400,
      message: 'x-voucha-client is required',
    })
  })

  it('rejects missing, duplicate, malformed, and incompatible metadata', () => {
    expect(() => parseClientHeaders({})).toThrow('x-voucha-client')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': ['web', 'swift'],
        'x-voucha-platform': 'web',
        'x-voucha-app-version': 'test',
      }),
    ).toThrow('exactly once')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': 'web',
        'x-voucha-platform': 'ios',
        'x-voucha-app-version': 'test',
      }),
    ).toThrow('incompatible')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
        'x-voucha-app-version': '\n',
      }),
    ).toThrow('invalid')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': 'unknown',
        'x-voucha-platform': 'web',
        'x-voucha-app-version': 'test',
      }),
    ).toThrow('invalid')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': 'web',
        'x-voucha-platform': 'unknown',
        'x-voucha-app-version': 'test',
      }),
    ).toThrow('invalid')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
        'x-voucha-app-version': 'a'.repeat(65),
      }),
    ).toThrow('invalid')
    expect(() =>
      parseClientHeaders({
        'x-voucha-client': 'web',
        'x-voucha-platform': 'web',
        'x-voucha-app-version': 'test',
        'x-voucha-sdk-version': ['one', 'two'],
      }),
    ).toThrow('exactly once')
  })
})
