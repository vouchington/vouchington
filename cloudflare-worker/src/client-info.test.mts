import { describe, expect, it } from 'vitest'
import {
  applyBackendClientInfoHeaders,
  CLIENT_INFO_HEADER_NAMES,
  REQUEST_KIND_HEADER,
} from './client-info.mts'

describe('applyBackendClientInfoHeaders', () => {
  it('stamps browser requests as the deployed web client', () => {
    const headers = new Headers({ 'sec-fetch-site': 'same-origin' })
    applyBackendClientInfoHeaders(headers, { gitCommit: 'abc123' })
    expect(Object.fromEntries(headers)).toMatchObject({
      'x-voucha-app-version': 'abc123',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
    })
  })

  it('uses a development version when the edge release is absent', () => {
    const headers = new Headers({ 'x-voucha-client': 'web' })
    applyBackendClientInfoHeaders(headers, {})
    expect(headers.get('x-voucha-app-version')).toBe('development')
  })

  it('preserves native client metadata on non-browser requests', () => {
    const headers = new Headers({
      'x-voucha-app-version': '1.0+1',
      'x-voucha-client': 'swift',
      'x-voucha-platform': 'ios',
      'x-voucha-sdk-version': '2.0',
    })
    applyBackendClientInfoHeaders(headers, { gitCommit: 'abc123' })
    expect(Object.fromEntries(headers)).toMatchObject({
      'x-voucha-app-version': '1.0+1',
      'x-voucha-client': 'swift',
      'x-voucha-platform': 'ios',
      'x-voucha-sdk-version': '2.0',
    })
  })

  it('overwrites spoofed native metadata on browser-shaped requests', () => {
    const headers = new Headers({
      'sec-fetch-mode': 'cors',
      'x-voucha-app-version': 'attacker',
      'x-voucha-client': 'swift',
      'x-voucha-platform': 'ios',
      'x-voucha-sdk-version': 'attacker',
    })
    applyBackendClientInfoHeaders(headers, { gitCommit: 'edge-release' })
    expect(headers.get('x-voucha-client')).toBe('web')
    expect(headers.get('x-voucha-platform')).toBe('web')
    expect(headers.get('x-voucha-app-version')).toBe('edge-release')
    expect(headers.get('x-voucha-sdk-version')).toBeNull()
  })

  it('leaves headerless non-browser callers invalid for backend enforcement', () => {
    const headers = new Headers()
    applyBackendClientInfoHeaders(headers, { gitCommit: 'abc123' })
    for (const name of CLIENT_INFO_HEADER_NAMES) expect(headers.get(name)).toBeNull()
  })

  it('sets only trusted request-kind values supplied by the worker', () => {
    const headers = new Headers({ [REQUEST_KIND_HEADER]: 'attacker' })
    applyBackendClientInfoHeaders(headers, { requestKind: 'cache-fill' })
    expect(headers.get(REQUEST_KIND_HEADER)).toBe('cache-fill')
  })

  it('strips a spoofed request kind when the worker supplies none', () => {
    const headers = new Headers({ [REQUEST_KIND_HEADER]: 'bot' })
    applyBackendClientInfoHeaders(headers, {})
    expect(headers.get(REQUEST_KIND_HEADER)).toBeNull()
  })
})
