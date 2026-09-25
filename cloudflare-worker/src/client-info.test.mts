import { describe, expect, it } from 'vitest'
import {
  applyBackendClientInfoHeaders,
  CLIENT_INFO_HEADER_NAMES,
  REQUEST_KIND_HEADER,
} from './client-info.mts'

const request = { method: 'GET', requestOrigin: 'https://voucha.ai' }

const spoofedNativeClientInfo = {
  'x-voucha-app-version': 'attacker',
  'x-voucha-client': 'swift',
  'x-voucha-platform': 'ios',
  'x-voucha-sdk-version': 'attacker',
}

function presentClientInfoHeaders(headers: Headers): string[] {
  return CLIENT_INFO_HEADER_NAMES.filter(name => headers.has(name))
}

describe('applyBackendClientInfoHeaders', () => {
  it('stamps browser requests as the deployed web client', () => {
    const headers = new Headers({ 'sec-fetch-site': 'same-origin' })
    applyBackendClientInfoHeaders(headers, { ...request, gitCommit: 'abc123' })
    expect(Object.fromEntries(headers)).toMatchObject({
      'x-voucha-app-version': 'abc123',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
    })
  })

  it('uses a development version when the edge release is absent', () => {
    const headers = new Headers({ 'sec-fetch-site': 'same-origin' })
    applyBackendClientInfoHeaders(headers, request)
    expect(headers.get('x-voucha-app-version')).toBe('development')
  })

  it('preserves native client metadata on non-browser requests', () => {
    const headers = new Headers({
      'x-voucha-app-version': '1.0+1',
      'x-voucha-client': 'swift',
      'x-voucha-platform': 'ios',
      'x-voucha-sdk-version': '2.0',
    })
    applyBackendClientInfoHeaders(headers, { ...request, gitCommit: 'abc123' })
    expect(Object.fromEntries(headers)).toMatchObject({
      'x-voucha-app-version': '1.0+1',
      'x-voucha-client': 'swift',
      'x-voucha-platform': 'ios',
      'x-voucha-sdk-version': '2.0',
    })
  })

  it('overwrites spoofed native metadata on same-origin browser requests', () => {
    const headers = new Headers({
      ...spoofedNativeClientInfo,
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    })
    applyBackendClientInfoHeaders(headers, { ...request, gitCommit: 'edge-release' })
    expect(headers.get('x-voucha-client')).toBe('web')
    expect(headers.get('x-voucha-platform')).toBe('web')
    expect(headers.get('x-voucha-app-version')).toBe('edge-release')
    expect(headers.get('x-voucha-sdk-version')).toBeNull()
  })

  it('strips all client metadata from browser requests without same-origin evidence', () => {
    const headers = new Headers({
      ...spoofedNativeClientInfo,
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
    })
    applyBackendClientInfoHeaders(headers, { ...request, gitCommit: 'edge-release' })
    expect(presentClientInfoHeaders(headers)).toEqual([])
  })

  it('does not trust a web claim without browser evidence', () => {
    const headers = new Headers({
      'x-voucha-app-version': 'claimed',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
    })
    applyBackendClientInfoHeaders(headers, { ...request, gitCommit: 'edge-release' })
    expect(presentClientInfoHeaders(headers)).toEqual([])
  })

  it('leaves headerless non-browser callers invalid for backend enforcement', () => {
    const headers = new Headers()
    applyBackendClientInfoHeaders(headers, { ...request, gitCommit: 'abc123' })
    expect(presentClientInfoHeaders(headers)).toEqual([])
  })

  it('sets only trusted request-kind values supplied by the worker', () => {
    const headers = new Headers({ [REQUEST_KIND_HEADER]: 'attacker' })
    applyBackendClientInfoHeaders(headers, { ...request, requestKind: 'cache-fill' })
    expect(headers.get(REQUEST_KIND_HEADER)).toBe('cache-fill')
  })

  it('strips a spoofed request kind when the worker supplies none', () => {
    const headers = new Headers({ [REQUEST_KIND_HEADER]: 'bot' })
    applyBackendClientInfoHeaders(headers, request)
    expect(headers.get(REQUEST_KIND_HEADER)).toBeNull()
  })
})
