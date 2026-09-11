import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EMPTY_BODY_SHA256, buildCanonicalRequestString, sha256Hex } from './request-canonical.mts'

describe('sha256Hex', () => {
  it('returns lowercase hex sha256 of a Buffer', () => {
    const result = sha256Hex(Buffer.from('hello', 'utf8'))
    expect(result).toBe(createHash('sha256').update('hello').digest('hex'))
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns lowercase hex sha256 of a string', () => {
    const result = sha256Hex('hello')
    expect(result).toBe(createHash('sha256').update('hello').digest('hex'))
  })
})

describe('EMPTY_BODY_SHA256', () => {
  it('equals sha256 of an empty string', () => {
    expect(EMPTY_BODY_SHA256).toBe(sha256Hex(''))
    expect(EMPTY_BODY_SHA256).toBe(sha256Hex(Buffer.alloc(0)))
  })

  it('is lowercase hex', () => {
    expect(EMPTY_BODY_SHA256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('buildCanonicalRequestString', () => {
  it('joins 6 lines with LF and no trailing newline', () => {
    const result = buildCanonicalRequestString(
      'POST',
      '/api/v1/posts',
      EMPTY_BODY_SHA256,
      '1700000000',
      'abc123nonce',
    )
    const lines = result.split('\n')
    expect(lines).toHaveLength(6)
    expect(result.endsWith('\n')).toBe(false)
  })

  it('produces the correct format for a POST request', () => {
    const bodySha256 = sha256Hex('{"title":"hello"}')
    const result = buildCanonicalRequestString(
      'POST',
      '/api/v1/posts',
      bodySha256,
      '1700000000',
      'mynonce',
    )
    expect(result).toBe(`VOUCHA-REQSIG-v1\nPOST\n/api/v1/posts\n${bodySha256}\n1700000000\nmynonce`)
  })

  it('uppercases the HTTP method', () => {
    const result = buildCanonicalRequestString('get', '/api/v1/foo', EMPTY_BODY_SHA256, '1', 'n')
    expect(result.split('\n')[1]).toBe('GET')
  })

  it('uses EMPTY_BODY_SHA256 for empty body GET requests', () => {
    const result = buildCanonicalRequestString(
      'GET',
      '/api/v1/session',
      EMPTY_BODY_SHA256,
      '1700000000',
      'nonce',
    )
    expect(result.split('\n')[3]).toBe(EMPTY_BODY_SHA256)
  })
})
