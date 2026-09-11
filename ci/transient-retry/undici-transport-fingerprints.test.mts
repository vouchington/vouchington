import { describe, expect, it } from 'vitest'

import { hasUndiciConnectTimeout, hasUndiciSocketClosed } from './undici-transport-fingerprints.mts'

const fullConnectTimeoutDump = [
  'node:internal/modules/run_main:107',
  '    triggerUncaughtException(',
  '    ^',
  '[TypeError: fetch failed] {',
  '  [cause]: ConnectTimeoutError: Connect Timeout Error (attempted addresses: 2606:4700:3033::ac43:8207:443, timeout: 10000ms)',
  "    code: 'UND_ERR_CONNECT_TIMEOUT'",
  '  }',
  '}',
].join('\n')

describe('hasUndiciConnectTimeout', () => {
  it('matches the full undici connect timeout dump', () => {
    expect(hasUndiciConnectTimeout(fullConnectTimeoutDump)).toBe(true)
  })

  it.each([
    [
      'missing the fetch-failed TypeError wrapper',
      fullConnectTimeoutDump.replace('[TypeError: fetch failed] {', '{'),
    ],
    [
      'missing the ConnectTimeoutError cause',
      fullConnectTimeoutDump.replace(
        'ConnectTimeoutError: Connect Timeout Error (attempted addresses: 2606:4700:3033::ac43:8207:443, timeout: 10000ms)',
        'some other cause',
      ),
    ],
    [
      'missing the UND_ERR_CONNECT_TIMEOUT code',
      fullConnectTimeoutDump.replace("code: 'UND_ERR_CONNECT_TIMEOUT'", "code: 'UND_ERR_OTHER'"),
    ],
  ])('does not match when %s', (_name, text) => {
    expect(hasUndiciConnectTimeout(text)).toBe(false)
  })

  it('does not match unrelated error text', () => {
    expect(
      hasUndiciConnectTimeout(
        'Error: Staging evidence request 42 returned invalid x-frame-options',
      ),
    ).toBe(false)
  })

  it('does not match an empty string', () => {
    expect(hasUndiciConnectTimeout('')).toBe(false)
  })
})

const fullSocketClosedDump = [
  'node:internal/deps/undici/undici:1422',
  '          Error.captureStackTrace(err, this);',
  '          ^',
  '[TypeError: fetch failed] {',
  '  [cause]: SocketError: other side closed',
  "    code: 'UND_ERR_SOCKET'",
  '  }',
  '}',
].join('\n')

describe('hasUndiciSocketClosed', () => {
  it('matches the full undici socket-closed dump', () => {
    expect(hasUndiciSocketClosed(fullSocketClosedDump)).toBe(true)
  })

  it.each([
    [
      'missing the fetch-failed TypeError wrapper',
      fullSocketClosedDump.replace('[TypeError: fetch failed] {', '{'),
    ],
    [
      'missing the other-side-closed cause',
      fullSocketClosedDump.replace('SocketError: other side closed', 'SocketError: other error'),
    ],
    [
      'missing the UND_ERR_SOCKET code',
      fullSocketClosedDump.replace("code: 'UND_ERR_SOCKET'", "code: 'UND_ERR_OTHER'"),
    ],
  ])('does not match when %s', (_name, text) => {
    expect(hasUndiciSocketClosed(text)).toBe(false)
  })

  it('does not match a connect-timeout dump', () => {
    expect(hasUndiciSocketClosed(fullConnectTimeoutDump)).toBe(false)
  })

  it('does not match an empty string', () => {
    expect(hasUndiciSocketClosed('')).toBe(false)
  })
})
