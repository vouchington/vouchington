import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import type { APIGatewayProxyEvent } from 'aws-lambda'

import { parseSideloadRequest } from '../parse-sideload.mts'

import { RequestParseError } from '../../errors.mts'

import { toBase64Url } from '../../../test-helpers/image-resize/index.mts'

import { signPath, SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'

import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'

function createMockEvent(
  base64url: string,
  queryParams: Record<string, string> = {},
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    pathParameters: { base64url },
    queryStringParameters: queryParams,
    headers,
  } as unknown as APIGatewayProxyEvent
}

describe('parseSideloadRequest', () => {
  it('should parse valid sideload request', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    const result = parseSideloadRequest(event)

    expect(result.url).toBe(url)
    expect(result.width).toBe(800)
    expect(result.quality).toBe(75) // default
    expect(result.lossless).toBe(false) // default
    expect(result.progressive).toBe(false) // default
  })

  it('should parse all query parameters', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, {
      w: '1200',
      h: '800',
      q: '90',
      l: '1',
      p: '1',
      f: 'webp',
    })

    const result = parseSideloadRequest(event)

    expect(result.url).toBe(url)
    expect(result.width).toBe(1200)
    expect(result.height).toBe(800)
    expect(result.quality).toBe(90)
    expect(result.lossless).toBe(true)
    expect(result.progressive).toBe(true)
    expect(result.format).toBe('webp')
  })

  it('should extract Accept header', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' }, { Accept: 'image/webp,image/*' })

    const result = parseSideloadRequest(event)

    expect(result.acceptHeader).toBe('image/webp,image/*')
  })

  it('should handle lowercase accept header', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' }, { accept: 'image/avif' })

    const result = parseSideloadRequest(event)

    expect(result.acceptHeader).toBe('image/avif')
  })

  it('should throw on missing base64url', () => {
    const event = createMockEvent('', { w: '800' })
    event.pathParameters = {}

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Missing base64url in path')
  })

  it('should throw on invalid URL after base64 decode', () => {
    // This base64 decodes to "not a url" which is not a valid URL
    const event = createMockEvent('bm90IGEgdXJs', { w: '800' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Invalid URL')
  })

  it('should throw on non-http URL', () => {
    const url = 'ftp://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('must be http:// or https://')
  })

  it('should throw on file:// URL', () => {
    const url = 'file:///etc/passwd'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('must be http:// or https://')
  })

  it('should allow http URLs', () => {
    const url = 'http://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    const result = parseSideloadRequest(event)

    expect(result.url).toBe(url)
  })

  it('should allow https URLs', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    const result = parseSideloadRequest(event)

    expect(result.url).toBe(url)
  })

  it('should throw on missing width', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, {})

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Missing required parameter: w')
  })

  it('should throw on invalid width', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: 'invalid' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Invalid width')
  })

  it('should throw on negative width', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '-100' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Invalid width')
  })

  it('should throw on invalid height', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800', h: 'invalid' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Invalid height')
  })

  it('should throw on invalid quality', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800', q: '150' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Invalid quality')
  })

  it('should throw on invalid format', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800', f: 'gif' })

    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
    expect(() => parseSideloadRequest(event)).toThrow('Invalid format')
  })

  it('should handle URLs with query parameters', () => {
    const url = 'https://example.com/image.jpg?v=123&quality=high'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    const result = parseSideloadRequest(event)

    expect(result.url).toBe(url)
  })

  it('should handle URLs with special characters', () => {
    const url = 'https://example.com/path/to/image-file_v2.0.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })

    const result = parseSideloadRequest(event)

    expect(result.url).toBe(url)
  })

  it('should parse lossless as true for "true" value', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800', l: 'true' })

    const result = parseSideloadRequest(event)

    expect(result.lossless).toBe(true)
  })

  it('should parse progressive as true for "true" value', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800', p: 'true' })

    const result = parseSideloadRequest(event)

    expect(result.progressive).toBe(true)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof beforeEach)
  void (0 as unknown as typeof afterEach)
  void (0 as unknown as typeof RequestParseError)
  void (0 as unknown as typeof signPath)
  void (0 as unknown as typeof SIDELOAD_SIGNING_KEYS_ENV)
  void (0 as unknown as typeof TEST_SIDELOAD_SIGNING_KEY)
})
